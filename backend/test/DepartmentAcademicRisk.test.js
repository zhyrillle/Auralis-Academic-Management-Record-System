const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getSummary } = require('../services/DepartmentAcademicRiskService');
const monitoring = require('../services/StudentMonitoringService');
const { fixture } = require('./fixtures/teacherMonitoring');
const now = new Date('2026-11-14T00:00:00Z');
const contextService = code => ({ context: async user => {
  assert.equal(user.normalized_role, 'department_head');
  return { department: { name: code }, subject: { subjectId: code === 'ENG' ? 1 : code === 'MAPEH' ? 4 : 2 }, schoolYears: [{ id: 3, label: '2026-2027' }] };
} });
const user = { user_id: 9, normalized_role: 'department_head' };

test('Department summaries match the actual Principal academic calculator for each subject, including MAPEH', async () => {
  for (const code of ['ENG', 'MATH', 'MAPEH']) {
    const f = fixture({ code });
    const subject = code === 'ENG' ? 1 : code === 'MAPEH' ? 4 : 2;
    const principal = await monitoring.getPreview(f.database, { schoolYear: '3', subject: String(subject), term: 'T1' }, now, { academicOnly: true });
    const summary = await getSummary(f.database, user, { schoolYear: '2026-2027', term: 'T1', subject: '999' }, now, { contextService: contextService(code) });
    for (const level of ['high', 'moderate', 'low']) {
      assert.equal(summary.summary[level], principal.students.filter(row => row.academic.riskLevel === level).length);
      assert.equal(summary.byGrade.find(row => row.grade === 8)[level], summary.summary[level]);
    }
    assert.equal(summary.context.subjectId, subject);
    assert.equal(summary.summary.totalLearners, 2);
    assert.equal(summary.students, undefined, 'aggregate endpoint does not return learner identities');
    assert.ok(f.calls.every(call => !call.sql.includes('PHIL_IRI') && !call.sql.includes('FROM ATTENDANCE')));
    const otherGrade = await getSummary(f.database, user, { schoolYearId: 3, gradeLevel: 'G9', term: 'T1' }, now, { contextService: contextService(code) });
    assert.equal(otherGrade.summary.total, 0);
  }
});

test('invalid or missing scores and duplicate sheets remain unavailable, never Low', async () => {
  for (const settings of [{ noScores: true }, { invalidScore: true }, { duplicateSheet: true }, { duplicateOffering: true }]) {
    const result = await getSummary(fixture(settings).database, user, { schoolYearId: 3, term: 'T1' }, now, { contextService: contextService('ENG') });
    assert.equal(result.summary.total, 0);
    assert.equal(result.summary.low, 0);
    assert.equal(result.summary.unavailable, 2);
  }
});

test('defaults to current term and rejects invalid year, grade and term', async () => {
  const f = fixture(), dependencies = { contextService: contextService('ENG') };
  const result = await getSummary(f.database, user, { schoolYearId: 3 }, now, dependencies);
  assert.equal(result.context.term, 'T2');
  for (const query of [{ schoolYearId: 999 }, { schoolYearId: 3, term: 'T4' }, { schoolYearId: 3, gradeLevel: 'G11' }]) {
    await assert.rejects(getSummary(f.database, user, query, now, dependencies), error => error.status === 400);
  }
});

test('Overall sums the real rule-based results once per learner per term', async () => {
  const f = fixture(), dependencies = { contextService: contextService('ENG') };
  const terms = await Promise.all(['T1', 'T2', 'T3'].map(term => getSummary(f.database, user, { schoolYearId: 3, term }, now, dependencies)));
  const overall = await getSummary(f.database, user, { schoolYearId: 3, term: 'ALL' }, now, dependencies);
  for (const key of ['high', 'moderate', 'low', 'total', 'unavailable', 'totalLearners']) {
    assert.equal(overall.summary[key], terms.reduce((sum, result) => sum + result.summary[key], 0));
  }
  assert.equal(overall.summary.totalLearners, 6);
  assert.equal(overall.context.term, 'ALL');
  assert.equal(overall.context.countingUnit, 'learner-term');
});

test('department access is resolved before any requested subject or school records are read', async () => {
  let reads = 0;
  await assert.rejects(getSummary({ execute: async () => { reads++; } }, { normalized_role: 'principal' }, { schoolYearId: 3 }, now), error => error.status === 403);
  assert.equal(reads, 0);
});

test('grade comparison returns all passing grades plus distinct learner hover counts', async () => {
  const express = require('express'), db = require('../config/db');
  const original = db.query;
  let server;
  try {
    db.query = async (sql, params) => {
      if (sql.includes('SELECT department_id FROM USER')) return [[{ department_id: 1 }]];
      assert.match(sql, /quarterly_grade >= 75/);
      assert.match(sql, /COUNT\(DISTINCT CASE/);
      assert.match(sql, /EXISTS \(SELECT 1 FROM ACADEMIC_TERM/);
      assert.match(sql, /UTC_TIMESTAMP/);
      assert.deepEqual(params, [1, '2026', 'G8', 'T2']);
      return [[{ gradeLevel: 'G8', aboveAverage: '2', passed: '10', fail: '2', total: '12', passedLearners: '9', failedLearners: '2' }]];
    };
    const app = express(); app.use('/dashboard', require('../routes/departmentHeadDashboardRoutes'));
    server = await new Promise(resolve => { const node = app.listen(0, '127.0.0.1', () => resolve(node)); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/dashboard/comparative-analysis?schoolYear=2026-2027&gradeLevel=G8&quarter=2`, { headers: { 'X-Auralis-User-Id': '1' } });
    assert.equal(response.status, 200);
    const [row] = await response.json();
    assert.equal(row.passed, 10);
    assert.equal(row.passedLearners, 9);
    assert.equal(row.failedLearners, 2);
    assert.equal(row.passingRate, 83);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    db.query = original;
  }
});

test('department risk endpoint resolves the assigned subject and rejects other roles through the router', async () => {
  const express = require('express'), User = require('../models/User'), db = require('../config/db');
  const originalFind = User.findById, originalExecute = db.execute;
  const f = fixture({ code: 'MATH' });
  let server;
  try {
    User.findById = async id => ({ user_id: id, department_id: 2, role: id === 1 ? 'Department Head' : 'Principal', account_status: 'Active' });
    db.execute = async (sql, params) => {
      if (sql.includes('FROM DEPARTMENT d')) return [[{ department_id: 2, department_name: 'Mathematics', department_code: 'MATH' }]];
      if (sql.includes('FROM SUBJECT WHERE department_id')) return [[{ subject_id: 2, subject_code: 'MATH', subject_name: 'Mathematics' }]];
      if (sql.includes('FROM GRADE_LEVEL ORDER')) return [[{ grade_level_id: 2, grade_level_name: 'Grade 8' }]];
      if (sql.includes('FROM SCHOOL ORDER')) return [[]];
      if (sql.includes('FROM SCHOOL_YEAR')) return [[{ school_year_id: 3, starts_on: 2026, ends_on: 2027, status: 'ONGOING' }]];
      return f.database.execute(sql, params);
    };
    const app = express(); app.use('/monitoring', require('../routes/deptHeadMonitoringRoutes'));
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}/monitoring/academic-risk?schoolYearId=3&term=T1&subject=1`;
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { headers: { 'X-Auralis-User-Id': '2' } })).status, 403);
    const response = await fetch(base, { headers: { 'X-Auralis-User-Id': '1' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    assert.equal(result.context.subjectId, 2);
    assert.equal(result.context.department, 'Mathematics');
    assert.equal(result.summary.totalLearners, 2);
    assert.equal(result.students, undefined);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    User.findById = originalFind; db.execute = originalExecute;
  }
});
