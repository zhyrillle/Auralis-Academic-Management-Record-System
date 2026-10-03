const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/db');
const GradingPeriodService = require('../services/GradingPeriodService');
const GradeSheet = require('../models/GradeSheet');
const GradeReopenRequest = require('../models/GradeReopenRequest');
const TemporaryReopening = require('../models/TemporaryReopening');
const Module = require('node:module');

test('Academic Period queries preserve records without department metadata', async (t) => {
  const originalExecute = db.execute;
  t.after(() => {
    db.execute = originalExecute;
  });

  const queries = [];
  db.execute = async (sql) => {
    queries.push(sql);
    if (/COUNT\(gs\.grade_sheet_id\)/.test(sql)) {
      return [[{
        department_id: 0,
        department_name: 'Unassigned Department',
        total: 28,
        submitted: 18,
        overdue: 10,
      }]];
    }
    if (/FROM GRADE_REOPEN_REQUEST grr/.test(sql)) {
      return [[{ request_id: 1 }]];
    }
    if (/FROM TEMPORARY_REOPENING tr/.test(sql)) {
      return [[{ temporary_reopening_id: 1 }]];
    }
    if (/FROM GRADE_SHEET gs/.test(sql)) {
      return [[{ grade_sheet_id: 2, term_id: 1 }]];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  const results = await Promise.all([
    GradingPeriodService.__test.getDepartmentStatus(1),
    GradingPeriodService.__test.getReopeningRequests(1),
    GradingPeriodService.__test.getActiveReopenings(1),
    GradingPeriodService.__test.getSubmissionRecords(1),
  ]);

  assert.equal(results[0][0].name, 'Unassigned Department');
  assert.equal(results[0][0].submitted, 18);
  assert.equal(results[1][0].request_id, 1);
  assert.equal(results[2][0].temporary_reopening_id, 1);
  assert.equal(results[3][0].grade_sheet_id, 2);
  assert.equal(queries.length, 4);
  for (const sql of queries) assert.match(sql, /LEFT JOIN DEPARTMENT d/);
});

test('request window is exactly seven days after term end, independent of submission deadline', () => {
  const { deriveReopeningWindow, requestWindowReason, reopeningEligibility } = GradingPeriodService.__test;
  const end = '2026-09-15T16:00:00Z';
  const window = deriveReopeningWindow(end);
  assert.equal(window.opensAt.toISOString(), '2026-09-15T16:00:00.000Z');
  assert.equal(window.closesAt.toISOString(), '2026-09-22T16:00:00.000Z');
  assert.equal(requestWindowReason(end, '2026-09-15T15:59:59.999Z'), 'WINDOW_NOT_OPEN');
  assert.equal(requestWindowReason(end, end), null);
  assert.equal(requestWindowReason(end, '2026-09-22T15:59:59.999Z'), null);
  assert.equal(requestWindowReason(end, '2026-09-22T16:00:00Z'), 'WINDOW_CLOSED');
  assert.equal(requestWindowReason(null, end), 'WINDOW_NOT_CONFIGURED');
  const sheet = { ends_at: end, grade_submission_deadline_at: '2026-09-25T16:00:00Z', workflow_status: 'SUBMITTED', lock_status: 'EDITABLE' };
  assert.equal(reopeningEligibility(sheet, Date.parse('2026-09-16T00:00:00Z')).eligible, true);
  assert.equal(reopeningEligibility({ ...sheet, workflow_status: 'DRAFT' }, Date.parse('2026-09-16T00:00:00Z')).reason, 'SHEET_NOT_ELIGIBLE');
  assert.equal(reopeningEligibility({ ...sheet, workflow_status: 'DRAFT', lock_status: 'TERM_LOCKED' }, Date.parse('2026-09-16T00:00:00Z')).request_type, 'LATE_SUBMISSION');
  assert.equal(reopeningEligibility({ ...sheet, has_pending: 1 }, Date.parse('2026-09-16T00:00:00Z')).reason, 'REQUEST_ALREADY_PENDING');
  assert.equal(reopeningEligibility({ ...sheet, has_active: 1 }, Date.parse('2026-09-16T00:00:00Z')).reason, 'TEMPORARY_ACCESS_ACTIVE');
});

test('the default school year comes from the most recently ended assigned term', () => {
  const { getReopeningDefaultSchoolYear } = GradingPeriodService.__test;
  const now = Date.parse('2026-10-03T00:00:00Z');
  const sheets = [
    { school_year_id: 1, school_year_starts_on: 2025, ends_at: '2026-03-20T16:00:00Z' },
    { school_year_id: 2, school_year_starts_on: 2026, ends_at: '2026-09-15T16:00:00Z' },
    { school_year_id: 3, school_year_starts_on: 2027, ends_at: '2027-09-15T16:00:00Z' },
    { school_year_id: 2, school_year_starts_on: 2026, ends_at: '2027-04-08T16:00:00Z' },
  ];
  assert.equal(getReopeningDefaultSchoolYear(sheets, now), 2);
  assert.equal(getReopeningDefaultSchoolYear([...sheets].reverse(), now), 2);
  assert.equal(getReopeningDefaultSchoolYear(sheets.slice(2, 3), now), 3);
  assert.equal(getReopeningDefaultSchoolYear([], now), null);
});

test('options include stable selection identifiers and eligibility remains specific to each term', async (t) => {
  const { reopeningEligibility } = GradingPeriodService.__test;
  const now = Date.parse('2026-09-18T00:00:00Z');
  const common = { workflow_status: 'SUBMITTED', lock_status: 'TERM_LOCKED' };
  assert.equal(reopeningEligibility({ ...common, ends_at: '2026-09-15T16:00:00Z' }, now).eligible, true);
  assert.equal(reopeningEligibility({ ...common, ends_at: '2027-01-15T16:00:00Z' }, now).reason, 'WINDOW_NOT_OPEN');
  assert.equal(reopeningEligibility({ ...common, ends_at: '2026-03-20T16:00:00Z' }, now).reason, 'WINDOW_CLOSED');
  const fixture = serviceFixture(t);
  await GradingPeriodService.getReopeningOptions(11);
  const query = fixture.queries.find(item => item.sql.includes('ORDER BY at.grade_submission_deadline_at'));
  for (const field of ['sec.section_id', 's.subject_id', 'at.term_id', 'sy.school_year_id']) assert(query.sql.includes(field));
  assert.deepEqual(query.params, [11]);
});

function serviceFixture(t, overrides = {}) {
  const now = Date.now();
  const row = { request_id: 1, grade_sheet_id: 15, teacher_assignment_id: 42, user_id: 11,
    workflow_status: 'SUBMITTED', lock_status: 'TERM_LOCKED', status: 'PENDING',
    subject_offering_id: 7, assignment_offering_id: 7,
    ends_at: new Date(now - 3 * 86400000), grade_submission_deadline_at: new Date(now - 86400000),
    requested_at: new Date(now - 2 * 86400000), has_pending: 0, has_active: 0, ...overrides };
  const queries = [];
  const changes = [];
  const connection = {
    beginTransaction: async () => changes.push('BEGIN'), commit: async () => changes.push('COMMIT'),
    rollback: async () => changes.push('ROLLBACK'), release: () => {},
    execute: async (sql, params) => {
      queries.push({ sql, params });
      if (/SELECT/.test(sql.trim().slice(0, 6))) {
        if (sql.includes('FROM TEMPORARY_REOPENING tr') && !sql.includes('SELECT grr.*')) return [[]];
        return [[{ ...row }]];
      }
      return [{ insertId: 55, affectedRows: 1 }];
    },
  };
  t.mock.method(db, 'getConnection', async () => connection);
  t.mock.method(db, 'execute', async (sql, params) => {
    queries.push({ sql, params });
    return /^\s*UPDATE/.test(sql) ? [{ affectedRows: 0 }] : [[{ ...row }]];
  });
  t.mock.method(GradeReopenRequest, 'create', async (data, activeConnection) => {
    assert.equal(activeConnection, connection);
    changes.push(data); row.has_pending = 1; return 1;
  });
  t.mock.method(GradeReopenRequest, 'findById', async () => ({ ...row }));
  t.mock.method(GradeReopenRequest, 'update', async (_id, data) => { changes.push(data); return { ...row, ...data }; });
  t.mock.method(GradeSheet, 'openTemporaryAccess', async () => changes.push('OPEN_ACCESS'));
  t.mock.method(TemporaryReopening, 'findById', async () => ({ temporary_reopening_id: 55 }));
  return { row, queries, changes };
}
const admin = { user_id: 99, normalized_role: 'system_admin' };

test('valid in-window requests can be approved later with an independent custom deadline', async (t) => {
  const fixture = serviceFixture(t, { ends_at: new Date(Date.now() - 20 * 86400000), requested_at: new Date(Date.now() - 18 * 86400000) });
  const expires = new Date(Date.now() + 14 * 86400000).toISOString();
  await GradingPeriodService.approveRequest(1, { expires_at: expires }, admin);
  assert(fixture.changes.includes('OPEN_ACCESS'));
  const insert = fixture.queries.find(query => query.sql.includes('INSERT INTO TEMPORARY_REOPENING'));
  assert.equal(new Date(insert.params[1] + 'Z').toISOString(), expires);
  assert(fixture.changes.includes('COMMIT'));
});

test('a submitted sheet remains approvable after term end even before its submission deadline', async (t) => {
  const fixture = serviceFixture(t, { lock_status: 'EDITABLE', grade_submission_deadline_at: new Date(Date.now() + 86400000) });
  await GradingPeriodService.approveRequest(1, { duration_minutes: 1440 }, admin);
  assert(fixture.changes.includes('OPEN_ACCESS'));
});

for (const [label, overrides, code] of [
  ['request before term end', { requested_at: new Date(Date.now() - 4 * 86400000) }, 'REQUEST_OUTSIDE_WINDOW'],
  ['request after window close', { ends_at: new Date(Date.now() - 20 * 86400000), requested_at: new Date(Date.now() - 86400000) }, 'REQUEST_OUTSIDE_WINDOW'],
  ['already reviewed', { status: 'APPROVED' }, 'REQUEST_ALREADY_REVIEWED'],
  ['wrong offering', { assignment_offering_id: 8 }, 'REQUEST_SHEET_MISMATCH'],
  ['active access', { has_active: 1 }, 'TEMPORARY_ACCESS_ACTIVE'],
  ['editable draft', { workflow_status: 'DRAFT', lock_status: 'EDITABLE' }, 'SHEET_NOT_ELIGIBLE'],
]) {
  test(`approval rejects ${label} without changing the sheet`, async (t) => {
    const fixture = serviceFixture(t, overrides);
    await assert.rejects(GradingPeriodService.approveRequest(1, { duration_minutes: 1440 }, admin), { code });
    assert(!fixture.changes.includes('OPEN_ACCESS'));
    assert(fixture.changes.includes('ROLLBACK'));
  });
}

test('approval deadline must be future and explicit; seven-day editing cap is not a request rule', () => {
  const { approvalExpiry } = GradingPeriodService.__test;
  const now = Date.parse('2026-10-03T00:00:00Z');
  assert.equal(approvalExpiry({ expires_at: '2026-10-20T17:00:00+08:00' }, now).toISOString(), '2026-10-20T09:00:00.000Z');
  assert.throws(() => approvalExpiry({ expires_at: '2026-10-02T00:00:00Z' }, now), { code: 'INVALID_EXPIRATION' });
  assert.throws(() => approvalExpiry({ expires_at: '2026-10-20T17:00:00' }, now), { code: 'INVALID_EXPIRATION' });
  assert.throws(() => approvalExpiry({ duration_minutes: 0 }, now), { code: 'INVALID_DURATION' });
});

test('creation uses the selected sheet, server timestamp, ownership and a locked transaction', async (t) => {
  const fixture = serviceFixture(t);
  await GradingPeriodService.createReopeningRequest(15, 'Correct the encoded score.', { user_id: 11 });
  const created = fixture.changes.find(value => value && typeof value === 'object' && value.grade_sheet_id);
  assert.equal(created.grade_sheet_id, 15);
  assert.equal(created.teacher_assignment_id, 42);
  assert.equal(created.status, 'PENDING');
  assert(Number.isFinite(new Date(created.requested_at + 'Z').getTime()));
  const owned = fixture.queries.find(query => query.sql.includes('LIMIT 1 FOR UPDATE'));
  assert.deepEqual(owned.params, [11, 15]);
  await assert.rejects(GradingPeriodService.createReopeningRequest(15, 'Duplicate.', { user_id: 11 }), { code: 'REQUEST_ALREADY_PENDING' });
});

test('unconfigured dates produce an explicit state instead of crashing options', async (t) => {
  serviceFixture(t, { ends_at: null });
  const options = await GradingPeriodService.getReopeningOptions(11);
  assert.equal(options[0].reason, 'WINDOW_NOT_CONFIGURED');
  assert.equal(options[0].eligible, false);
});

test('expired editing access cannot be auto-unlocked just because the submission deadline is later', async (t) => {
  const fixture = serviceFixture(t);
  await GradingPeriodService.runLifecycleGuard();
  const unlock = fixture.queries.find(query => query.sql.includes("gs.lock_status = 'EDITABLE'"));
  assert.match(unlock.sql, /at\.ends_at > UTC_TIMESTAMP/);
});

test('only the requester may cancel, and only while pending', async (t) => {
  const fixture = serviceFixture(t);
  await assert.rejects(GradingPeriodService.cancelReopeningRequest(1, { user_id: 12 }), { code: 'REQUEST_OWNER_REQUIRED' });
  fixture.row.status = 'APPROVED';
  await assert.rejects(GradingPeriodService.cancelReopeningRequest(1, { user_id: 11 }), { code: 'REQUEST_ALREADY_REVIEWED' });
  fixture.row.status = 'PENDING';
  const cancelled = await GradingPeriodService.cancelReopeningRequest(1, { user_id: 11 });
  assert.equal(cancelled.status, 'CANCELLED');
});

function capturedRoute(t, routeName, dependencies) {
  const filename = require.resolve(`../routes/${routeName}`);
  const handlers = new Map();
  const middleware = [];
  const router = { use: (...items) => middleware.push(...items) };
  for (const method of ['get', 'post', 'put', 'delete']) router[method] = (route, ...items) => handlers.set(`${method} ${route}`, items);
  const originalLoad = Module._load;
  t.mock.method(Module, '_load', function(request, parent, isMain) {
    if (parent?.filename === filename) {
      if (request === 'express') return { Router: () => router };
      if (Object.hasOwn(dependencies, request)) return dependencies[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  });
  delete require.cache[filename]; require(filename);
  t.after(() => delete require.cache[filename]);
  return { handlers, middleware };
}
function responseCapture() {
  return { code: 200, payload: null, status(value) { this.code = value; return this; }, json(value) { this.payload = value; return this; } };
}

test('multipart requests use selected sheet and central policy; caller status cannot bypass approval', async (t) => {
  const calls = [];
  const authentication = () => {};
  const route = capturedRoute(t, 'gradeReopenRequestRoutes.js', {
    '../middleware/resolveCurrentUser': { resolveCurrentUser: authentication, requireSystemAdmin: () => {} },
    '../middleware/uploadRequestFile': { array: () => () => {} },
    '../services/requestFileStorage': {},
    '../services/GradingPeriodService': {
      getReopeningEligibility: async (id, user) => { calls.push([id, user]); return { eligible: true }; },
      createReopeningRequest: async (id, reason, actor) => { calls.push([id, reason, actor.user_id]); return { request_id: 55 }; },
    },
  });
  assert.equal(route.middleware[0], authentication);
  const response = responseCapture();
  await route.handlers.get('post /').at(-1)({ body: { grade_sheet_id: '15', reason: 'Fix score.', status: 'APPROVED', teacher_assignment_id: '999' }, currentUser: { user_id: 11 }, files: [] }, response);
  assert.equal(response.code, 201);
  assert.deepEqual(calls, [['15', 11], ['15', 'Fix score.', 11]]);
  const blocked = responseCapture();
  await route.handlers.get('put /:id').at(-1)({ body: { status: 'APPROVED' } }, blocked);
  assert.equal(blocked.code, 409);
});

test('direct temporary-access mutation routes are blocked and administrator-protected', async (t) => {
  const auth = () => {};
  const adminOnly = () => {};
  const route = capturedRoute(t, 'temporaryReopeningRoutes.js', {
    '../middleware/resolveCurrentUser': { resolveCurrentUser: auth, requireSystemAdmin: adminOnly },
  });
  assert.deepEqual(route.middleware, [auth, adminOnly]);
  for (const name of ['post /', 'put /:id', 'delete /:id']) {
    const response = responseCapture();
    route.handlers.get(name).at(-1)({}, response);
    assert.equal(response.code, 405);
    assert.equal(response.payload.code, 'WORKFLOW_REQUIRED');
  }
});

test('generic grade-sheet mutations cannot unlock or manufacture sheets outside the workflow', (t) => {
  const route = capturedRoute(t, 'gradeSheetRoutes.js', {
    '../models/GradeSheet': {
      create: () => assert.fail('Direct creation must not run'),
      update: () => assert.fail('Direct unlocking must not run'),
      delete: () => assert.fail('Direct deletion must not run'),
    },
  });
  for (const name of ['post /', 'put /:id', 'delete /:id']) {
    const response = responseCapture();
    route.handlers.get(name).at(-1)({ body: { lock_status: 'EDITABLE' } }, response);
    assert.equal(response.code, 405);
    assert.equal(response.payload.code, 'WORKFLOW_REQUIRED');
  }
});

test('extending an open term deadline keeps the request window tied to its unchanged end', () => {
  const now = Date.now();
  const end = new Date(now + 86400000);
  const term = { term_name: '1st', starts_at: new Date(now - 86400000), ends_at: end,
    grade_submission_deadline_at: new Date(now + 3 * 86400000) };
  const result = GradingPeriodService.__test.validateTimeline(term, {
    ends_at: new Date(now + 10 * 86400000),
    grade_submission_deadline_at: new Date(now + 15 * 86400000),
  });
  assert.equal(result.ends_at, end);
  assert.equal(result.reopening_requests_open_at, end.toISOString().slice(0, 23).replace('T', ' '));
  assert.equal(result.reopening_requests_close_at,
    new Date(end.getTime() + 7 * 86400000).toISOString().slice(0, 23).replace('T', ' '));
});

test('request lookup errors are not disguised as an empty request history', async (t) => {
  t.mock.method(db, 'execute', async () => { throw new Error('Database unavailable'); });
  t.mock.method(console, 'error', () => {});
  await assert.rejects(GradeReopenRequest.findAll(), /Database unavailable/);
  await assert.rejects(GradeReopenRequest.findByUserId(11), /Database unavailable/);
});

test('term-locked drafts and submitted sheets are both eligible for temporary access', () => {
  const { isReopenableLockedSheet, getReopeningRequestType } =
    GradingPeriodService.__test;

  assert.equal(isReopenableLockedSheet('DRAFT', 'TERM_LOCKED'), true);
  assert.equal(isReopenableLockedSheet('SUBMITTED', 'TERM_LOCKED'), true);
  assert.equal(isReopenableLockedSheet('DRAFT', 'EDITABLE'), false);
  assert.equal(
    isReopenableLockedSheet('SUBMITTED', 'TEMPORARILY_REOPENED'),
    false,
  );
  assert.equal(isReopenableLockedSheet('UNKNOWN', 'TERM_LOCKED'), false);

  assert.equal(getReopeningRequestType('DRAFT'), 'LATE_SUBMISSION');
  assert.equal(getReopeningRequestType('SUBMITTED'), 'GRADE_CORRECTION');
});
