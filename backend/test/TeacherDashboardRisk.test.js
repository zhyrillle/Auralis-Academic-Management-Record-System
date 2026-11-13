const test = require('node:test');
const assert = require('node:assert/strict');
const { getRiskOverview } = require('../services/TeacherDashboardRiskService');
const SectionDetails = require('../services/SectionDetailsService');
const { fixture } = require('./fixtures/teacherMonitoring');
const now = new Date('2026-11-13T00:00:00Z');

function assignedFixture(options) {
  const f = fixture(options), execute = f.database.execute;
  f.database.execute = async (sql, params) => sql.includes('SELECT ta.teacher_assignment_id, so.subject_offering_id,')
    ? [[{ ...f.assignment, teacher_assignment_id: f.assignment.assignment_id }]] : execute(sql, params);
  return f;
}

test('dashboard bands and grades come from real shared monitoring for English, Math, Science and MAPEH', async () => {
  for (const code of ['ENG', 'MATH', 'SCI', 'MAPEH']) {
    const f = assignedFixture({ code });
    const data = await getRiskOverview(f.database, 10, { schoolYearId: 3, termCode: 'T1' }, { now });
    const details = await SectionDetails.getSectionDetails({ assignmentType: 'teaching',
      assignmentId: f.assignment.assignment_id, userId: 10, term: 'T1' }, f.database, { now });
    assert.equal(data.totalScored, 2);
    for (const row of data.students) {
      const academic = details.learners.find(student => student.studentSectionId === row.student_section_id).academic;
      assert.equal(row.subjects[0].grade, academic.gradePreview);
      assert.equal(row.risk_level, academic.riskLevel === 'moderate' ? 'medium' : academic.riskLevel);
    }
    assert.ok(f.calls.every(call => /^\s*SELECT/.test(call.sql)));
  }
});

test('missing and invalid scores never become low risk', async () => {
  for (const options of [{ noScores: true }, { invalidScore: true }, { duplicateSheet: true }]) {
    const f = assignedFixture(options);
    const data = await getRiskOverview(f.database, 10, { schoolYearId: 3, termCode: 'T1' }, { now });
    assert.deepEqual(data.counts, { high: 0, medium: 0, low: 0 });
    assert.equal(data.unavailableCount, 2);
  }
});

test('a learner taught in multiple subjects is counted once at the highest available band', async () => {
  const assignments = [{ teacher_assignment_id: 1, subject_offering_id: 101, subject_code: 'ENG' },
    { teacher_assignment_id: 2, subject_offering_id: 102, subject_code: 'MATH' }];
  const database = { execute: async () => [assignments] };
  const monitoringService = { getOptions: async () => ({ schoolYears: [{ value: '3', label: 'SY 2026–2027' }] }) };
  const detailsService = { getSectionDetails: async request => ({ context: { sectionId: 7, sectionName: 'Demo',
    gradeLevel: 'G8', subject: { name: request.assignmentId === 1 ? 'English' : 'Math' } }, capabilities: {},
    learners: [{ studentSectionId: 501, studentId: 1, name: 'Demo Learner', academic: {
      status: 'available', riskLevel: request.assignmentId === 1 ? 'low' : 'high', gradePreview: request.assignmentId === 1 ? 90 : 70 } }] }) };
  const data = await getRiskOverview(database, 10, { schoolYearId: 3, termCode: 'T2' }, { monitoringService, detailsService });
  assert.deepEqual(data.counts, { high: 1, medium: 0, low: 0 });
  assert.equal(data.students[0].subjects.length, 2);
});

test('English prediction uses the viewed source term; ongoing terms stay unavailable', async () => {
  const f = assignedFixture({ submitted: false });
  const data = await getRiskOverview(f.database, 10, { schoolYearId: 3, termCode: 'T2' }, { mode: 'prediction', now });
  assert.equal(data.sourceTerm, 'T2');
  assert.equal(data.targetTerm, 'T3');
  assert.equal(data.totalScored, 0);
  assert.equal(data.unavailableCount, 2);
  assert.match(data.notices[0], /after this term ends/);
  assert.equal(data.predictionReady, false);
  assert.equal(data.predictionSections[0].label, 'Ongoing term');
  const math = assignedFixture({ code: 'MATH' });
  const noEnglish = await getRiskOverview(math.database, 10, { schoolYearId: 3, termCode: 'T2' }, { mode: 'prediction', now });
  assert.equal(noEnglish.students.length, 0);
  assert.match(noEnglish.notices[0], /No English/);
  const lastTerm = await getRiskOverview(f.database, 10, { schoolYearId: 3, termCode: 'T3' }, { mode: 'prediction', now });
  assert.equal(lastTerm.targetTerm, null);
  assert.equal(lastTerm.predictionReady, false);
  assert.match(lastTerm.notices[0], /last term/);
});

test('monitoring exposes the same English readiness as Section Details for completed and reopened terms', async () => {
  for (const submitted of [true, false]) {
    const f = assignedFixture({ submitted });
    const data = await getRiskOverview(f.database, 10, { schoolYearId: 3, termCode: 'T1' }, { now });
    const detail = await SectionDetails.getSectionDetails({ assignmentType: 'teaching', assignmentId: 1,
      userId: 10, term: 'T1' }, f.database, { now });
    assert.equal(data.predictionReady, detail.capabilities.predictionReady);
    assert.equal(data.predictionReady, submitted);
  }
});

test('dashboard risk endpoint returns the versioned monitoring contract and English readiness notes', async () => {
  const express = require('express');
  const db = require('../config/db');
  const router = require('../routes/adviserDashboardRoutes');
  const originalExecute = db.execute;
  const f = assignedFixture({ submitted: false });
  let server;
  try {
    db.execute = (sql, params) => sql.includes('CURRENT_TIMESTAMP() BETWEEN')
      ? Promise.resolve([[{ ...f.periods()[1], school_year_id: 3 }]]) : f.database.execute(sql, params);
    const app = express();
    app.use('/api/adviser/dashboard', router);
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}/api/adviser/dashboard/at-risk-students`;
    const monitoring = await (await fetch(`${base}?userId=10`)).json();
    assert.equal(monitoring.version, 'teacher-dashboard-risk-v2');
    assert.equal(monitoring.mode, 'monitoring');
    assert.equal(monitoring.totalScored, 2);
    const prediction = await (await fetch(`${base}?userId=10&mode=prediction`)).json();
    assert.equal(prediction.totalScored, 0);
    assert.equal(prediction.mode, 'prediction');
    assert.ok(prediction.notices.length);
    assert.equal((await fetch(`${base}?userId=10&mode=bad`)).status, 400);
    assert.equal((await fetch(base)).status, 400);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    db.execute = originalExecute;
  }
});
