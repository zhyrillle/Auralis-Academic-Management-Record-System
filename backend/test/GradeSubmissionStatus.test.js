const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const stub = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/GradeSubmissionStatusService.js'), 'utf8'), {
  module: stub, require(name) {
    assert.equal(name, '../config/db');
    return { execute() { throw Error('School database access forbidden in tests'); } };
  },
});
const Service = stub.exports;
function fixture(overrides = {}) {
  const calls = [];
  const rows = {
    terms: [1, 2, 3].map(n => ({ term_id: n, term_name: `${n}${['', 'st', 'nd', 'rd'][n]}` })),
    offerings: [{ subject_offering_id: 131, subject_name: 'English' }],
    sheets: [{ grade_sheet_id: 12, subject_offering_id: 131, term_id: 1, workflow_status: 'SUBMITTED',
      lock_status: 'TERM_LOCKED', submitted_at: '2026-10-04T15:35:19.719Z' },
    { grade_sheet_id: 38, subject_offering_id: 131, term_id: 2, workflow_status: 'DRAFT', lock_status: 'EDITABLE', submitted_at: null }],
    teachers: [{ subject_offering_id: 131, first_name: 'Assigned', last_name: 'Teacher' }],
    actors: [{ grade_sheet_id: 12, user_id: 33, first_name: 'Actual', last_name: 'Submitter' }], ...overrides,
  };
  const database = { async execute(sql, params) {
    calls.push({ sql, params: Array.from(params) });
    assert.match(sql, /^\s*SELECT\b/i, 'status reads must never write');
    assert.doesNotMatch(sql, /STUDENT_GRADE|GRADE_ACTIVITY|\bSCORE\b/, 'no grade calculations or learner records');
    if (overrides.failure) throw Error('Synthetic read failure');
    if (sql.includes('FROM SECTION_ADVISER_ASSIGNMENT saa')) return [params[0] === 1 && params[1] === 28 ? [{ section_id: 18, school_year_id: 1 }] : []];
    if (sql.includes('SELECT DISTINCT so.section_id')) return [params[0] === 131 && params[1] === 3 ? [{ section_id: 18, school_year_id: 1 }] : []];
    assert.equal(params[0], 18, 'all section reads stay in the authorized scope');
    if (sql.includes('FROM ACADEMIC_TERM')) return [rows.terms];
    if (sql.includes('FROM AUDIT_EVENT')) return [rows.actors];
    if (sql.includes('FROM TEACHER_ASSIGNMENT')) return [rows.teachers];
    if (sql.includes('FROM GRADE_SHEET')) return [rows.sheets];
    if (sql.includes('FROM SUBJECT_OFFERING')) return [rows.offerings];
    throw Error('Unexpected SQL');
  } };
  // Academic terms are scoped by school-year alone, not by section.
  const execute = database.execute;
  database.execute = async (sql, params) => {
    if (sql.includes('FROM ACADEMIC_TERM')) {
      calls.push({ sql, params: Array.from(params) }); assert.equal(params[0], 1); return [rows.terms];
    }
    return execute(sql, params);
  };
  return { calls, rows, read: (query = { adviserAssignmentId: 1 }, user = { user_id: 28 }) => Service.read(query, user, database) };
}
test('reads all three term statuses without calculating or changing grades', async () => {
  const f = fixture(), result = await f.read();
  assert.equal(result.context.schoolYearId, 1);
  assert.deepEqual(Array.from(result.subjects[0].terms, t => t.state), ['SUBMITTED', 'NOT_SUBMITTED', 'NOT_SUBMITTED']);
  assert.equal(result.subjects[0].terms[0].submittedBy.name, 'Actual Submitter');
  assert.equal(result.subjects[0].assignedTeachers[0], 'Assigned Teacher');
  assert(f.calls.every(c => c.sql.trim().startsWith('SELECT')));
});
test('teacher reads are restricted to their own offering and year', async () => {
  const f = fixture();
  const result = await f.read({ subjectOfferingId: 131 }, { user_id: 3 });
  assert.equal(result.context.subjectOfferingId, 131);
  assert(f.calls.filter(c => c.sql.includes('so.section_id = ?')).every(c => c.params[2] === 131));
  await assert.rejects(f.read({ subjectOfferingId: 131 }, { user_id: 999 }), e => e.statusCode === 403);
  await assert.rejects(f.read({ adviserAssignmentId: 1 }, { user_id: 3 }), e => e.statusCode === 403);
});
test('missing identity and invalid selections are rejected', async () => {
  const f = fixture();
  await assert.rejects(f.read(undefined, null), e => e.statusCode === 401);
  for (const query of [{}, { subjectOfferingId: 0 }, { adviserAssignmentId: 'invalid' }, { adviserAssignmentId: 1, subjectOfferingId: 131 }]) {
    await assert.rejects(f.read(query), e => e.statusCode === 400);
  }
  assert.equal(f.calls.length, 0);
});
test('a locked draft is not labelled submitted; reopened sheets retain last-submission metadata', async () => {
  const f = fixture();
  f.rows.sheets[1].lock_status = 'TERM_LOCKED';
  assert.equal((await f.read()).subjects[0].terms[1].state, 'NOT_SUBMITTED');
  f.rows.sheets[0].workflow_status = 'DRAFT'; f.rows.sheets[0].lock_status = 'TEMPORARILY_REOPENED';
  const record = (await f.read()).subjects[0].terms[0];
  assert.equal(record.state, 'IN_CORRECTION'); assert(record.submittedAt); assert.equal(record.submittedBy.name, 'Actual Submitter');
});
test('missing submitter is not replaced with the assigned teacher', async () => {
  const result = await fixture({ actors: [] }).read();
  assert.equal(result.subjects[0].terms[0].state, 'SUBMITTED');
  assert.equal(result.subjects[0].terms[0].submittedBy, null);
});
test('duplicate sheets, missing terms and unknown workflow states are unavailable', async () => {
  const f = fixture(); f.rows.sheets.push({ ...f.rows.sheets[0], grade_sheet_id: 99 });
  assert.equal((await f.read()).subjects[0].terms[0].state, 'UNAVAILABLE');
  f.rows.terms.pop(); assert.equal((await f.read()).subjects[0].terms[2].state, 'UNAVAILABLE');
  f.rows.sheets[1].workflow_status = 'UNKNOWN'; assert.equal((await f.read()).subjects[0].terms[1].state, 'UNAVAILABLE');
});
test('no offerings is empty, while database failures reject instead of reporting no submissions', async () => {
  assert.equal((await fixture({ offerings: [] }).read()).subjects.length, 0);
  await assert.rejects(fixture({ failure: true }).read(), /Synthetic read failure/);
});

test('read route preserves authentication and failure HTTP responses', async () => {
  const handlers = [];
  let failure = null, reads = 0;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/gradeSubmissionStatusRoutes.js'), 'utf8'), {
    module: { exports: {} }, require(name) {
      if (name === 'express') return { Router: () => ({ get: (_path, ...callbacks) => handlers.push(...callbacks) }) };
      if (name === '../middleware/resolveCurrentUser') return { resolveCurrentUser(req, res, next) {
        if (!req.signedIn) return res.status(401).json({ message: 'Sign in required' });
        req.currentUser = { user_id: 28 }; return next();
      } };
      if (name === '../services/GradeSubmissionStatusService') return { async read() {
        reads++; if (failure) throw failure; return { statusVersion: 1, subjects: [] };
      } };
      throw Error('Unexpected dependency');
    },
  });
  const response = () => ({ statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
    set(key, value) { this.headers[key] = value; }, json(body) { this.body = body; return this; } });
  const anonymous = response(); handlers[0]({ signedIn: false }, anonymous, () => { throw Error('Must not continue'); });
  assert.equal(anonymous.statusCode, 401); assert.equal(reads, 0);
  const req = { signedIn: true, query: {} }, ok = response();
  handlers[0](req, ok, () => {}); await handlers[1](req, ok);
  assert.equal(ok.headers['Cache-Control'], 'no-store'); assert.equal(ok.body.statusVersion, 1);
  failure = Object.assign(Error('Not your class'), { statusCode: 403 });
  const denied = response(); await handlers[1](req, denied); assert.equal(denied.statusCode, 403);
  failure = Error('Private database error');
  const failed = response(); await handlers[1](req, failed);
  assert.equal(failed.statusCode, 500); assert.match(failed.body.message, /Unable to load/); assert.doesNotMatch(failed.body.message, /Private/);
});
