const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeSubmissions, submissionTotals, getSubmissionMonitor } = require('../services/DeptSubmissionMonitorService');

const term = (overrides = {}) => ({ subject_offering_id: 88, teacher_name: 'Demo Teacher',
  subject_name: 'English', grade_level_name: 'G7', section_name: 'Carrots', term_id: 1,
  is_submitted: 0, deadline_passed: 0, submitted_late: 0, ...overrides });

test('selected term tracks actual submission, pending, overdue and late states', () => {
  for (const [fields, status, completion, overdue] of [
    [{}, 'Pending', 0, 0],
    [{ deadline_passed: 1 }, 'Overdue', 0, 1],
    [{ is_submitted: 1, deadline_passed: 1 }, 'Submitted', 100, 0],
    [{ is_submitted: 1, deadline_passed: 1, submitted_late: 1 }, 'Submitted late', 100, 0],
    [{ deadline_passed: null }, 'Pending', 0, 0],
  ]) {
    const [row] = summarizeSubmissions([term(fields)]);
    assert.equal(row.status, status);
    assert.equal(row.completion, completion);
    assert.equal(row.overdueTerms, overdue);
  }
});

test('all terms counts configured terms including missing grade sheets and prioritizes overdue', () => {
  const rows = summarizeSubmissions([term({ is_submitted: '1' }), term({ term_id: 2, deadline_passed: 1 }), term({ term_id: 3 })]);
  assert.equal(rows[0].expectedTerms, 3);
  assert.equal(rows[0].submittedTerms, 1);
  assert.equal(rows[0].completion, 33);
  assert.equal(rows[0].status, 'Overdue');
  assert.deepEqual(submissionTotals(rows), { submittedGrades: 1, submittedGradesPercent: 33, delayedSubmissions: 1 });
  const [twoTerms] = summarizeSubmissions([term({ is_submitted: 1 }), term({ term_id: 2 })]);
  assert.equal(twoTerms.completion, 50);
  assert.equal(twoTerms.status, 'Pending');
});

test('unconfigured terms are explicit and different subjects remain separate', () => {
  const rows = summarizeSubmissions([term({ term_id: null }), term({ subject_offering_id: 89, subject_name: 'Research', is_submitted: 1 })]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].completion, null);
  assert.equal(rows[0].status, 'Not configured');
  assert.equal(rows[1].subject, 'Research');
  assert.deepEqual(submissionTotals(rows), { submittedGrades: 1, submittedGradesPercent: 100, delayedSubmissions: 0 });
  assert.deepEqual(submissionTotals([]), { submittedGrades: 0, submittedGradesPercent: 0, delayedSubmissions: 0 });
});

test('completed all-terms view preserves late-submission information without counting it as overdue', () => {
  const [row] = summarizeSubmissions([term({ is_submitted: 1 }), term({ term_id: 2, is_submitted: 1, submitted_late: 1, deadline_passed: 1 })]);
  assert.equal(row.status, 'Submitted late');
  assert.equal(row.completion, 100);
  assert.equal(row.lateTerms, 1);
  assert.equal(row.overdueTerms, 0);
});

test('query scopes department/year/grade and all-term aliases never default to Term 1', async () => {
  for (const quarter of [undefined, '', 'overall', 'all', 'All', '1', '2', '3']) {
    let call;
    const db = { query: async (sql, params) => { call = { sql, params }; return [[term()]]; } };
    await getSubmissionMonitor(db, 9, { schoolYear: '2026-2027', gradeLevel: 'G8', quarter });
    const selected = ['1', '2', '3'].includes(quarter);
    assert.deepEqual(call.params, selected ? [{ '1': '1st', '2': '2nd', '3': '3rd' }[quarter], 9, '2026', 'G8'] : [9, '2026', 'G8']);
    assert.equal(call.sql.includes('AND at.term_name = ?'), selected);
    assert.equal((call.sql.match(/\?/g) || []).length, call.params.length);
    assert.match(call.sql, /LEFT JOIN GRADE_SHEET/);
    assert.match(call.sql, /at.school_year_id = sy.school_year_id/);
    assert.match(call.sql, /gs.term_id = at.term_id/);
    assert.match(call.sql, /MAX\(gs.workflow_status = 'SUBMITTED'\)/);
    assert.match(call.sql, /GROUP BY[\s\S]*at.term_id/);
    assert.match(call.sql, /deadline_at <= UTC_TIMESTAMP\(6\)/);
  }
});

test('database failures propagate instead of returning an empty success', async () => {
  await assert.rejects(getSubmissionMonitor({ query: async () => { throw new Error('Unavailable'); } }, 9), /Unavailable/);
});

function routes(fail = false) {
  const handlers = new Map();
  const router = { use() {}, get: (path, handler) => handlers.set(path, handler) };
  const db = { query: async (sql, params) => {
    if (sql.includes('SELECT department_id FROM USER')) return [[{ department_id: 9 }]];
    if (sql.includes('AS totalTeachers')) return [[{ totalTeachers: 2 }]];
    if (sql.includes('AS atRisk')) return [[{ atRisk: 1 }]];
    assert.match(sql, /WHERE s.department_id = \?/);
    assert.deepEqual(Array.from(params), [9, '2026']);
    if (fail) throw new Error('Database unavailable');
    return [[term({ is_submitted: 1 }), term({ term_id: 2, deadline_passed: 1 }), term({ term_id: 3 })]];
  } };
  require('node:vm').runInNewContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../routes/departmentHeadDashboardRoutes.js'), 'utf8'), {
    module: { exports: {} }, require: name => {
      if (name === 'express') return { Router: () => router };
      if (name === '../config/db') return db;
      if (name === '../services/DeptSubmissionMonitorService') return { getSubmissionMonitor, submissionTotals };
      if (name === '../services/DeptHeadClassRecordService' || name === './deptHeadMonitoringRoutes') return {};
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return async path => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    await handlers.get(path)({ headers: { 'x-auralis-user-id': '45' }, query: { schoolYear: '2026-2027' } }, res);
    return res;
  };
}

test('dashboard cards and monitor use identical submission totals for the same filters', async () => {
  const request = routes();
  const monitor = await request('/submission-monitor');
  const stats = await request('/stats');
  assert.equal(monitor.statusCode, 200);
  assert.equal(stats.statusCode, 200);
  const totals = submissionTotals(monitor.body);
  for (const key of Object.keys(totals)) assert.equal(stats.body[key], totals[key]);
  assert.equal(stats.body.delayedSubmissions, 1);
  assert.equal(stats.body.submittedGradesPercent, 33);
});

test('both endpoints report database failures as errors', async () => {
  const request = routes(true);
  for (const endpoint of ['/stats', '/submission-monitor']) {
    const result = await request(endpoint);
    assert.equal(result.statusCode, 500);
    assert.equal(result.body.error, 'Database unavailable');
  }
});
