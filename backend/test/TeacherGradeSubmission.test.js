// All persistence is in memory. Importing the school DB is explicitly forbidden.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const calculator = require('../services/GradeComputationService');
const EventEmitter = require('node:events');
const teacher = { user_id: 3, first_name: 'Fixture', last_name: 'Teacher' };
const request = { subject_offering_id: 131, section_id: 18, school_year_id: 1, term: 'T2' };
function load(file, requires) {
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file.endsWith('.js') ? file : file + '.js'), 'utf8'), { module: mod, console, Date, Set, Map, require(name) {
    if (!Object.hasOwn(requires, name)) throw Error(`Unstubbed dependency: ${name}`);
    return requires[name];
  } });
  return mod.exports;
}
function fixture(options = {}) {
  let state = {
    offering: { subject_offering_id: 131, subject_id: 3, section_id: 18, school_year_id: 1, department_id: 1, subject_code: 'ENG', subject_name: 'English', section_name: 'Fixture', teacher_assignment_id: 21 },
    terms: [
      { term_id: 1, term_name: '1st', starts_at: '2026-06-01T00:00:00Z', ends_at: '2026-09-15T00:00:00Z', grade_submission_deadline_at: '2026-09-16T00:00:00Z', status: 'completed' },
      { term_id: 3, term_name: '2nd', starts_at: '2026-09-16T00:00:00Z', ends_at: '2026-12-18T00:00:00Z', grade_submission_deadline_at: '2026-12-19T00:00:00Z', status: 'ongoing' },
      { term_id: 4, term_name: '3rd', starts_at: '2027-01-04T00:00:00Z', ends_at: '2027-04-08T00:00:00Z', grade_submission_deadline_at: '2027-04-09T00:00:00Z', status: 'upcoming' }],
    sheets: [{ grade_sheet_id: 12, subject_offering_id: 131, term_id: 1, workflow_status: 'SUBMITTED', lock_status: 'TERM_LOCKED', submitted_at: '2026-10-04T15:35:19Z' },
      { grade_sheet_id: 38, subject_offering_id: 131, term_id: 3, workflow_status: 'DRAFT', lock_status: 'EDITABLE', submitted_at: null }],
    students: [{ student_id: 195, student_section_id: 177, first_name: 'Fixture', last_name: 'Learner', sex: 'M', lrn: '100000000001' }],
    weights: [{ percentage: 30, component_code: 'WW' }, { percentage: 50, component_code: 'PT' }, { percentage: 20, component_code: 'STE' }],
    activities: [
      { activity_id: 10, activity_name: 'Written work', component_code: 'WW', highest_possible_score: 40, status: 'ACTIVE' },
      { activity_id: 11, activity_name: 'Performance task', component_code: 'PT', highest_possible_score: 50, status: 'ACTIVE' },
      { activity_id: 12, activity_name: 'ST1', component_code: 'STE', highest_possible_score: 30, status: 'ACTIVE' },
      { activity_id: 13, activity_name: 'ST2', component_code: 'STE', highest_possible_score: 30, status: 'ACTIVE' },
      { activity_id: 14, activity_name: 'Term Exam', component_code: 'STE', highest_possible_score: 40, status: 'ACTIVE' }],
    scores: [39, 50, 27, 27, 36].map((raw_score, i) => ({ score_id: 100 + i, activity_id: 10 + i, student_section_id: 177, raw_score, score_status: 'ENCODED' })),
    config: { is_custom_enabled: 0, ranges_json: null },
    saved: [{ subject_offering_id: 131, student_id: 195, student_section_id: 177, term: 'T1', mapeh_component: null, initial_grade: 97.29, quarterly_grade: 98 },
      { subject_offering_id: 131, student_id: 195, student_section_id: 177, term: 'T3', mapeh_component: null, initial_grade: 91, quarterly_grade: 91 }],
    audits: [], notifications: [], ...options.state,
  };
  const calls = [], transactionEvents = [], emitted = [];
  let before;
  const connection = {
    async beginTransaction() { before = structuredClone(state); transactionEvents.push('begin'); },
    async commit() { transactionEvents.push('commit'); before = null; },
    async rollback() { transactionEvents.push('rollback'); if (before) state = before; before = null; },
    release() { transactionEvents.push('release'); },
    async execute(sql, params = []) {
      calls.push({ sql, params: Array.from(params) });
      if (options.failSql && sql.includes(options.failSql)) throw Object.assign(Error('Synthetic database failure'), { code: options.failCode || 'ETIMEDOUT' });
      if (sql.includes('SELECT UTC_TIMESTAMP')) return [[{ submitted_at: '2026-10-23T06:00:00Z' }]];
      if (sql.includes('s.department_id = COALESCE(')) {
        assert.match(sql, /dh\.appointed_from <= CURDATE\(\)/);
        assert.match(sql, /dh\.appointed_until >= CURDATE\(\)/);
        const departmentId = options.headDepartmentId ?? params[4];
        return [params[0] === 131 && params[1] === 18 && params[2] === 1 && params[3] === 4
          && Number(departmentId) === state.offering.department_id ? [state.offering] : []];
      }
      if (sql.includes('JOIN TEACHER_ASSIGNMENT') && params.length === 4) return [params[0] === 131 && params[1] === 18 && params[2] === 1 && params[3] === 3 ? [state.offering] : []];
      if (sql.includes('FROM SUBJECT_OFFERING so') && params.length !== 4) return [params.at(-1) === 131 ? [state.offering] : []];
      if (sql.includes('FROM TEACHER_ASSIGNMENT WHERE')) return [params[0] === 131 && params[1] === 3 ? [{ teacher_assignment_id: 21 }] : []];
      if (sql.includes('FROM STUDENT_SECTION WHERE')) return [state.students];
      if (sql.includes('SELECT score_id FROM SCORE')) return [state.scores.filter(s => s.activity_id === params[0] && s.student_section_id === params[1])];
      if (/UPDATE SCORE\s/.test(sql)) { Object.assign(state.scores.find(s => s.score_id === params[2]), { raw_score: params[0], score_status: params[1] }); return [{ affectedRows: 1 }]; }
      if (sql.includes('FROM ACADEMIC_TERM')) return [state.terms];
      if (sql.includes('SELECT * FROM GRADE_SHEET') && !sql.includes('WHERE grade_sheet_id')) return [structuredClone(params.length === 1 ? state.sheets : state.sheets.filter(s => s.subject_offering_id === params[0] && s.term_id === params[1]))];
      if (sql.includes('SELECT gs.*, so.section_id')) return [state.sheets.filter(s => s.grade_sheet_id === params[0]).map(s => ({ ...s, ...state.offering, term_name: state.terms.find(t => t.term_id === s.term_id).term_name }))];
      if (sql.includes('FROM STUDENT_SECTION ss')) return [state.students];
      if (sql.includes('FROM SUBJECT_COMPONENT_WEIGHT')) return [state.weights];
      if (sql.includes('WHERE ga.activity_id = ? LIMIT 1')) return [state.activities.some(a => a.activity_id === params[0]) ? [state.sheets[1]] : []];
      if (sql.includes('FROM GRADE_ACTIVITY ga')) return [params[0] == null ? [] : state.activities.map(a => ({ ...a, assessment_id: a.activity_id, max_score: a.highest_possible_score }))];
      if (sql.includes('FROM SCORE sc')) return [state.scores];
      if (sql.includes('FROM SCORE sc')) return [state.scores];
      if (sql.includes('FROM GRADE_TRANSMUTATION_CONFIG')) return [[state.config]];
      if (sql.includes('FROM TEMPORARY_REOPENING')) return [options.approved ? [{ temporary_reopening_id: 5 }] : []];
      if (sql.includes('FROM STUDENT_GRADE sg JOIN STUDENT_SECTION')) return [state.saved.filter(g => g.term === params[1])];
      if (sql.includes('SELECT * FROM STUDENT_GRADE')) return [params.length === 2 ? state.saved.filter(g => g.term === params[1]) : state.saved];
      if (sql.includes('INSERT INTO STUDENT_GRADE')) {
        const [subject_offering_id, student_id, student_section_id, term, mapeh_component, initial_grade, quarterly_grade, remarks] = params;
        const index = state.saved.findIndex(g => g.subject_offering_id === subject_offering_id && g.student_id === student_id && g.term === term && g.mapeh_component === mapeh_component);
        const row = { subject_offering_id, student_id, student_section_id, term, mapeh_component, initial_grade, quarterly_grade, remarks };
        if (index < 0) state.saved.push(row); else state.saved[index] = row;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('UPDATE GRADE_SHEET')) {
        Object.assign(state.sheets.find(s => s.grade_sheet_id === params.at(-1)),
          { workflow_status: params[0], submitted_at: params[1], lock_status: params[2] });
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT * FROM GRADE_SHEET WHERE grade_sheet_id')) return [[state.sheets.find(s => s.grade_sheet_id === params[0])]];
      if (sql === 'INSERT INTO AUDIT_EVENT fixture') { state.audits.push(JSON.parse(JSON.stringify(params[0]))); return [{ insertId: state.audits.length }]; }
      if (sql === 'INSERT INTO NOTIFICATION fixture') { state.notifications.push(JSON.parse(JSON.stringify(params[0]))); return [{ insertId: state.notifications.length }]; }
      throw Error('Unexpected SQL: ' + sql);
    },
  };
  const noDb = { execute() { throw Error('School DB forbidden'); } };
  const sheets = load('../models/GradeSheet.js', { '../config/db': noDb });
  sheets.editingWindow = async (value, actor) => {
    if (actor?.user_id !== teacher.user_id) return { editable: false };
    const sheet = state.sheets.find(s => s.grade_sheet_id === (value.gradeSheetId || value.grade_sheet_id)) || value;
    return { editable: sheet.workflow_status === 'DRAFT'
      && (sheet.lock_status === 'EDITABLE' || (sheet.lock_status === 'TEMPORARILY_REOPENED' && options.approved)),
      correction: sheet.lock_status === 'TEMPORARILY_REOPENED' };
  };
  const routes = new Map(), auth = () => {};
  const router = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map(method =>
    [method, (url, ...handlers) => routes.set(method + ' ' + url, handlers)]));
  const database = { getConnection: async () => connection, execute: (...args) => connection.execute(...args) };
  load('../routes/classRecordRoutes.js', {
    express: { Router: () => router }, '../config/db': database,
    '../models/GradeSheet': sheets,
    '../models/StudentGrade': load('../models/StudentGrade.js', { '../config/db': noDb }),
    '../models/GradeTransmutationConfig': { getActiveTiers: async () => [], isCustomEnabledSync: () => false, getActiveTiersSync: () => [] },
    '../middleware/resolveCurrentUser': { resolveCurrentUser: auth },
    '../models/AuditEvent': { async create(record, cx) { assert.equal(cx, connection); await cx.execute('INSERT INTO AUDIT_EVENT fixture', [record]); } },
    '../services/NotificationService': {
      async prepareGradePublicationNotifications(record, cx) { assert.equal(cx, connection); await cx.execute('INSERT INTO NOTIFICATION fixture', [record]); return [{ user_id: 28, record }]; },
      emitCommittedGradePublications(records) { assert.equal(transactionEvents.at(-1), 'commit'); if (options.emitFailure) throw Error('SSE unavailable'); emitted.push(...records); },
    },
    '../services/GradeComputationService': calculator,
    '../utils/depedTransmutation': require('../utils/depedTransmutation'), '../utils/encryption': { decryptLrn: value => value },
    '../services/GradingSheetWorkbookService': {},
  });
  const Service = router.__test;
  return { get state() { return state; }, calls, transactionEvents, emitted, connection, routes,
    autosave: async (scores, actor = teacher) => { const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } }; await Service.handleBatchScores({ body: { subject_offering_id: 131, term: 'T2', scores }, currentUser: actor }, res); return res; },
    submit: (body = request, actor = teacher) => Service.submitClassGrades(body, actor, database),
    summary: (body = request, actor = teacher) => Service.gradingSummary(body, actor, database) };
}
test('T2 submission uses server scores and preserves T1/T3, identifiers and both grade values', async () => {
  const f = fixture(), before = structuredClone(f.state.saved);
  const result = await f.submit({ ...request, students: [{ student_id: 195, term1: 1, term2: 2, term3: 3 }] });
  assert.equal(result.submitted, true); assert.equal(result.term, 'T2');
  assert.deepEqual(f.state.saved.filter(g => g.term !== 'T2'), before);
  const grade = f.state.saved.find(g => g.term === 'T2');
  assert.equal(grade.student_section_id, 177); assert.equal(grade.initial_grade, 97.25); assert.equal(grade.quarterly_grade, 97);
  assert.equal(f.state.sheets[0].workflow_status, 'SUBMITTED'); assert.equal(f.state.sheets[1].workflow_status, 'SUBMITTED');
  assert.equal(result.submissionVersion, 2); assert.equal(f.state.audits.length, 1); assert.equal(f.state.notifications.length, 1);
  assert.equal(f.emitted.length, 1); assert.deepEqual(f.transactionEvents, ['begin', 'commit', 'release']);
  const summary = await f.summary(); assert.equal(summary.students[0].term1, 98); assert.equal(summary.students[0].term2, 97);
});
test('repeat submissions are idempotent and do not replace dates or emit duplicate notifications', async () => {
  const f = fixture(); await f.submit(); const snapshot = structuredClone(f.state);
  assert.equal((await f.submit()).alreadySubmitted, true); assert.deepEqual(f.state, snapshot); assert.equal(f.emitted.length, 1);
});
test('saved transmutation On/Off is applied without changing the shared cache', async () => {
  const f = fixture({ state: { config: { is_custom_enabled: 1, ranges_json: JSON.stringify([{ min: 0, max: 100, transmuted: 82 }]) } } });
  await f.submit(); assert.equal(f.state.saved.find(g => g.term === 'T2').quarterly_grade, 82);
  assert.equal(f.state.config.is_custom_enabled, 1);
});
test('wrong users/context and missing/invalid terms never commit', async () => {
  for (const [body, actor, status] of [[request, null, 401], [request, { user_id: 99 }, 403], [{ ...request, section_id: 99 }, teacher, 403],
    [{ ...request, school_year_id: 99 }, teacher, 403], [{ ...request, term: undefined }, teacher, 400], [{ ...request, term: 'anything' }, teacher, 400]]) {
    const f = fixture(), before = structuredClone(f.state); await assert.rejects(f.submit(body, actor), e => e.statusCode === status);
    assert.deepEqual(f.state, before); assert(!f.transactionEvents.includes('commit'));
  }
});
test('blank/invalid/duplicate scores, HPS, weights, and incomplete rosters block publication; genuine zero is accepted', async () => {
  const variations = [f => { f.state.scores.pop(); }, f => { f.state.scores[0].raw_score = ''; }, f => { f.state.scores[0].raw_score = 41; },
    f => { f.state.scores.push({ ...f.state.scores[0] }); }, f => { f.state.activities[0].highest_possible_score = 0; },
    f => { f.state.weights[0].percentage = 25; }, f => { f.state.students.push({ student_id: 196, student_section_id: 178 }); },
    f => { f.state.students.push({ ...f.state.students[0] }); }, f => { f.state.scores[0].score_status = 'UNKNOWN'; },
    f => { f.state.activities[0].weight_subject_id = 99; f.state.activities[0].weight_school_year_id = 1; }];
  for (const change of variations) { const f = fixture(); change(f); const before = structuredClone(f.state); await assert.rejects(f.submit()); assert.deepEqual(f.state, before); }
  const zero = fixture(); zero.state.scores.forEach(s => { s.raw_score = 0; }); await zero.submit(); assert.equal(zero.state.saved.find(g => g.term === 'T2').quarterly_grade, 0);
});
test('failure after partial writes rolls back grades, status, audit and notification', async () => {
  for (const failSql of ['UPDATE GRADE_SHEET', 'INSERT INTO AUDIT_EVENT', 'INSERT INTO NOTIFICATION']) {
    const f = fixture({ failSql }), before = structuredClone(f.state); await assert.rejects(f.submit());
    assert.deepEqual(f.state, before); assert.equal(f.emitted.length, 0); assert(f.transactionEvents.includes('rollback'));
  }
});
test('closed terms require active approved reopening; published grades survive draft edits until resubmission', async () => {
  const f = fixture(); f.state.sheets[1].lock_status = 'TERM_LOCKED'; await assert.rejects(f.submit(), e => e.statusCode === 403);
  f.state.sheets[1].lock_status = 'TEMPORARILY_REOPENED'; await assert.rejects(f.submit(), e => e.statusCode === 403);
  const approved = fixture({ approved: true }); await approved.submit();
  const oldGrades = structuredClone(approved.state.saved);
  approved.state.sheets[1].workflow_status = 'DRAFT'; approved.state.sheets[1].lock_status = 'TEMPORARILY_REOPENED';
  approved.state.scores[0].raw_score = 20;
  assert.deepEqual(approved.state.saved, oldGrades, 'editing draft scores leaves accepted grades intact');
  await approved.submit(); assert.notDeepEqual(approved.state.saved, oldGrades);
  assert.equal(approved.state.sheets[1].lock_status, 'TERM_LOCKED');
});
test('a committed submission remains successful if live notification delivery fails', async () => {
  const f = fixture({ emitFailure: true }); assert.equal((await f.submit()).submitted, true); assert.equal(f.state.sheets[1].workflow_status, 'SUBMITTED');
});

const { selectSavedSummary } = require('../utils/depedTransmutation');
const GradeSheetPolicy = load('../models/GradeSheet.js', { '../config/db': { execute() { throw Error('School DB forbidden'); } } });
const canEdit = (...args) => GradeSheetPolicy.canEdit(...args);
const editingWindow = (...args) => GradeSheetPolicy.editingWindow(...args);
const user = { user_id: 3 }, sheet = { gradeSheetId: 38 };
function policyFixture(row = {}, access = []) {
  const calls = [];
  return { calls, execute: async (sql, params) => {
    calls.push({ sql, params });
    return sql.includes('FROM TEMPORARY_REOPENING') ? [access]
      : [[{ grade_sheet_id: 38, teacher_assignment_id: 21, workflow_status: 'DRAFT', lock_status: 'EDITABLE', within_submission_window: 1, ...row }]];
  } };
}
test('normal edits require the assigned teacher, a draft, and an open saved window', async () => {
  const cx = policyFixture(); assert.equal(await canEdit(sheet, user, cx), true);
  assert.deepEqual(Array.from(cx.calls[0].params), [3, 38]);
  assert.match(cx.calls[0].sql, /at.school_year_id = so.school_year_id/);
  assert.match(cx.calls[0].sql, /ta.assigned_until >= UTC_DATE/);
  assert.equal(await canEdit(sheet, null, cx), false);
  for (const row of [{ workflow_status: 'SUBMITTED' }, { lock_status: 'TERM_LOCKED' }, { within_submission_window: 0 }]) assert.equal(await canEdit(sheet, user, policyFixture(row)), false);
  assert.equal(await canEdit(sheet, user, { execute: async () => [[]] }), false);
});
test('an older reopened term uses its own approved, owner-scoped window, not the current term', async () => {
  const cx = policyFixture({ lock_status: 'TEMPORARILY_REOPENED', within_submission_window: 0 }, [{ temporary_reopening_id: 2, expires_at: '2026-11-01T00:00:00Z' }]);
  const result = await editingWindow(sheet, user, cx, { lock: true });
  assert.equal(result.editable, true); assert.equal(result.correction, true); assert.equal(result.deadline, '2026-11-01T00:00:00Z');
  assert.deepEqual(Array.from(cx.calls[1].params), [38, 21]); assert.match(cx.calls[1].sql, /grr.status = 'APPROVED'/);
  assert.match(cx.calls[1].sql, /tr.expires_at > UTC_TIMESTAMP/); assert.match(cx.calls[0].sql, /FOR UPDATE/);
  assert.equal(await canEdit(sheet, user, policyFixture({ lock_status: 'TEMPORARILY_REOPENED' })), false);
});
test('accepted legacy quarter grades are visible without inventing a valid initial grade', () => {
  const summary = selectSavedSummary({ initial_grade: 102.92, quarterly_grade: 100, remarks: 'Passed' }, true);
  assert.equal(summary.termGrade, 100); assert.equal(summary.initialGrade, null);
  assert.equal(summary.calculationError, 'SAVED_GRADE_REVIEW_REQUIRED');
  assert.equal(selectSavedSummary({ initial_grade: 102.92, quarterly_grade: 100 }).termGrade, null, 'Other consumers retain their prior validation');
});
test('MAPEH keeps separate MA/PEH grades and publishes their combined mean', () => {
  const data = { offering: { subject_code: 'MAPEH' }, students: [{ student_id: 1, student_section_id: 11 }],
    weights: [{ component_code: 'WW', percentage: 20 }, { component_code: 'PT', percentage: 60 }, { component_code: 'EX', percentage: 20 }],
    activities: ['MA', 'PEH'].flatMap((mapeh_component, n) => ['WW', 'PT', 'EX'].map((component_code, i) => ({ activity_id: n * 3 + i + 1,
      component_code, mapeh_component, activity_name: 'Assessment', highest_possible_score: 100 }))),
    scores: [100, 100, 100, 80, 80, 80].map((raw_score, i) => ({ activity_id: i + 1, student_section_id: 11, raw_score, score_status: 'ENCODED' })),
    config: { is_custom_enabled: false, ranges: [] } };
  const rows = calculator.calculateGrades(data);
  assert.deepEqual(rows.map(r => [r.mapehComponent, r.termGrade]), [['MA', 100], ['PEH', 80], [null, 90]]);
  data.scores.pop(); assert.throws(() => calculator.calculateGrades(data), { code: 'INCOMPLETE_GRADES' });
  assert.equal(calculator.calculateGrades({ ...data, componentOnly: 'MA' })[0].termGrade, 100);
});

test('publication notifications are scoped, deduplicated, and only emitted explicitly after persistence', async () => {
  const queries = [], inserts = [], delivered = [];
  const cx = { async execute(sql, params) { queries.push({ sql, params });
    return [sql.includes('SECTION_ADVISER_ASSIGNMENT') ? [{ user_id: 28 }, { user_id: 28 }] : [{ user_id: 40 }, { user_id: 28 }]]; } };
  const Notification = { NOTIFICATION_TYPES: { SUBMISSION: 'SUBMISSION' }, async create(record, connection) {
    assert.equal(connection, cx); inserts.push(record); return inserts.length;
  } };
  const Service = load('../services/NotificationService', { events: EventEmitter,
    '../config/db': { execute() { assert.fail('School DB forbidden'); } }, '../models/Notification': Notification });
  for (const id of [28, 40]) Service.emitter.on(`notification:${id}`, value => delivered.push(value));
  const records = await Service.prepareGradePublicationNotifications({ offering: { subject_offering_id: 131,
    section_id: 18, school_year_id: 1, subject_name: 'English', section_name: 'Fixture' }, sheetId: 38,
    term: 'T2', correction: false, teacherName: 'Fixture' }, cx);
  assert.deepEqual(inserts.map(r => r.user_id).sort(), [28, 40]); assert.equal(delivered.length, 0);
  const query = queries.find(q => q.sql.includes('SECTION_ADVISER_ASSIGNMENT'));
  assert.deepEqual(Array.from(query.params), [18, 1]); assert.match(query.sql, /account_status/); assert.match(query.sql, /assigned_until/);
  Service.emitCommittedGradePublications(records); assert.equal(delivered.length, 2);
  assert.equal(delivered[0].section_id, 18); assert.equal(delivered[0].school_year_id, 1);
  await assert.rejects(Service.prepareGradePublicationNotifications({ offering: { subject_offering_id: 131 } }, {
    execute: async () => { throw Error('Synthetic recipient lookup failed'); },
  }), /Synthetic recipient lookup failed/, 'Recipient failures must abort the enclosing publication transaction');
});

test('autosave persists only SCORE; accepted STUDENT_GRADE changes only on a successful resubmission', async () => {
  const f = fixture({ approved: true }); await f.submit();
  const accepted = structuredClone(f.state.saved), callStart = f.calls.length;
  f.state.sheets[1].workflow_status = 'DRAFT'; f.state.sheets[1].lock_status = 'TEMPORARILY_REOPENED';
  const result = await f.autosave([{ assessment_id: 10, student_id: 195, student_section_id: 177, raw_score: 20 }]);
  assert.equal(result.statusCode, 200); assert.equal(f.state.scores[0].raw_score, 20);
  assert.deepEqual(f.state.saved, accepted);
  assert.equal(result.body.students[195].termGrade, 83);
  assert(!f.calls.slice(callStart).some(c => /(?:INSERT INTO|UPDATE|DELETE FROM) STUDENT_GRADE/.test(c.sql)));
  assert.equal((await f.summary()).students[0].term2, 83, 'Teacher sees the current saved-score preview');
  await f.submit(); assert.equal(f.state.saved.find(g => g.term === 'T2').quarterly_grade, 83);
});
test('autosave rejects wrong enrollment, cross-sheet assessments, invalid numbers and caller-supplied teacher assignment', async () => {
  for (const item of [
    { assessment_id: 10, student_id: 195, student_section_id: 999, raw_score: 20 },
    { assessment_id: 999, student_id: 195, raw_score: 20 },
    { assessment_id: 10, student_id: 195, raw_score: 'NaN' },
  ]) {
    const f = fixture(), before = structuredClone(f.state);
    const response = await f.autosave([item]); assert.equal(response.statusCode, 400);
    assert.deepEqual(f.state, before);
  }
  const f = fixture(), denied = await f.autosave([{ assessment_id: 10, student_id: 195, raw_score: 20 }], { user_id: 99 });
  assert.equal(denied.statusCode, 403);
});
test('failure writing learner five rolls back the first four learners too', async () => {
  const f = fixture();
  const firstStudent = f.state.students[0], firstScores = f.state.scores.slice();
  f.state.students = [0, 1, 2, 3, 4].map(i => ({ ...firstStudent, student_id: 195 + i, student_section_id: 177 + i }));
  f.state.scores = f.state.students.flatMap(s => firstScores.map(score => ({ ...score, student_section_id: s.student_section_id })));
  const execute = f.connection.execute.bind(f.connection);
  f.connection.execute = async (sql, params) => {
    if (sql.includes('INSERT INTO STUDENT_GRADE') && params[1] === 199) throw Error('Synthetic learner-five failure');
    return execute(sql, params);
  };
  const before = structuredClone(f.state);
  await assert.rejects(f.submit(), /learner-five failure/);
  assert.deepEqual(f.state, before); assert.equal(f.emitted.length, 0);
});
test('the HTTP submission route preserves authentication and never reports database failure as success', async () => {
  const f = fixture({ failSql: 'INSERT INTO AUDIT_EVENT' });
  const handlers = f.routes.get('post /class-record/submit');
  assert.equal(typeof handlers[0], 'function');
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await handlers.at(-1)({ body: request, currentUser: teacher }, res);
  assert.equal(res.code, 500); assert.notEqual(res.body.submitted, true);
  for (const endpoint of ['post /scores/batch', 'post /assessments', 'put /assessments/:id', 'delete /assessments/:id']) {
    assert.equal(f.routes.get(endpoint).length, 2, endpoint + ' requires identity resolution');
  }
});

test('opening a class record is scoped and never rewrites accepted grades', async () => {
  const f = fixture(); await f.submit(); const before = structuredClone(f.state.saved), start = f.calls.length;
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await f.routes.get('get /class-record/:subject_offering_id').at(-1)({
    params: { subject_offering_id: '131' }, query: { term: 'T2', section_id: '18' }, currentUser: teacher,
  }, res);
  assert.equal(res.code, 200); assert.deepEqual(f.state.saved, before);
  assert(!f.calls.slice(start).some(c => /(?:INSERT INTO|UPDATE|DELETE FROM) STUDENT_GRADE/.test(c.sql)));
  assert.equal(res.body.students[0].quarterly_grade, 97);
  assert(f.calls.some(c => c.sql.includes('ss.school_year_id = ?') && c.params.includes(1)));
});

const departmentHead = { user_id: 4, normalized_role: 'department_head', department_id: 1 };
async function readRecord(f, actor, term = 'T2', query = {}) {
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await f.routes.get('get /class-record/:subject_offering_id').at(-1)({
    params: { subject_offering_id: '131' }, query: { term, section_id: '18', read_only: '1', ...query }, currentUser: actor,
  }, res);
  return res;
}

test('Department Head previews are scoped, read-only, and preserve submitted grades and the assigned teacher', async () => {
  const f = fixture(); await f.submit();
  const before = structuredClone(f.state), start = f.calls.length;
  const response = await readRecord(f, departmentHead);
  assert.equal(response.code, 200);
  assert.equal(response.body.is_editable, false);
  assert.equal(response.body.lock_reason, 'READ_ONLY_ACCESS');
  assert.equal(response.body.students[0].quarterly_grade, 97);
  assert.deepEqual(f.state, before);
  assert(f.calls.slice(start).every(call => /^\s*SELECT\b/.test(call.sql)));
  const contextQuery = f.calls.slice(start).find(call => call.sql.includes('AS teacher_name'));
  assert.match(contextQuery.sql, /MAX\(ta2\.teacher_assignment_id\)/);
  assert.match(contextQuery.sql, /saa2\.school_year_id = so\.school_year_id/);
});

test('Department Head drafts and unopened terms never initialize grade sheets or assessments', async () => {
  for (const term of ['T2', 'T3']) {
    const f = fixture(), before = structuredClone(f.state);
    const response = await readRecord(f, departmentHead, term);
    assert.equal(response.code, 200);
    assert.equal(response.body.is_editable, false);
    if (term === 'T3') {
      assert.equal(response.body.grade_sheet.grade_sheet_id, null);
      assert.equal(response.body.assessments.length, 0);
    }
    assert.deepEqual(f.state, before);
    assert(f.calls.every(call => /^\s*SELECT\b/.test(call.sql)), 'Monitoring must not create a sheet or activities');
  }
});

test('department scoping uses the current appointment before the resolved USER department', async () => {
  const appointed = fixture({ headDepartmentId: 1 });
  assert.equal((await readRecord(appointed, { ...departmentHead, department_id: 9 })).code, 200);
  const otherDepartment = fixture({ headDepartmentId: 9 });
  assert.equal((await readRecord(otherDepartment, departmentHead)).code, 403);
  assert.equal((await readRecord(fixture(), { ...departmentHead, department_id: null })).code, 403);
  assert.equal((await readRecord(fixture(), { user_id: 99, normalized_role: 'subject_teacher', department_id: 1 })).code, 403);
  assert.equal((await readRecord(fixture(), departmentHead, 'T2', { section_id: '99' })).code, 409);
});

test('Department Heads with a teaching assignment retain their own teacher access outside monitoring', async () => {
  const f = fixture(); await f.submit();
  const response = await readRecord(f, { ...teacher, normalized_role: 'department_head' }, 'T2', { read_only: '0' });
  assert.equal(response.code, 200);
  assert.notEqual(response.body.lock_reason, 'READ_ONLY_ACCESS');
  assert(!f.calls.some(call => call.sql.includes('s.department_id = COALESCE(')));
});

test('Department Head monitoring permission never grants Submit, autosave, or assessment editing', async () => {
  const f = fixture(), before = structuredClone(f.state);
  await assert.rejects(f.submit(request, departmentHead), error => error.statusCode === 403);
  assert.equal((await f.autosave([{ assessment_id: 10, student_id: 195, raw_score: 20 }], departmentHead)).statusCode, 403);
  for (const [endpoint, body] of [
    ['post /assessments', { subject_offering_id: 131, term: 'T2', max_score: 20, component_code: 'WW' }],
    ['put /assessments/:id', { max_score: 25 }], ['delete /assessments/:id', {}],
  ]) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await f.routes.get(endpoint).at(-1)({ params: { id: '10' }, body, currentUser: departmentHead }, res);
    assert.equal(res.code, 403, endpoint);
  }
  assert.deepEqual(f.state, before);
  assert(!f.calls.some(call => /^\s*(INSERT|UPDATE|DELETE)\b/.test(call.sql)));
});
