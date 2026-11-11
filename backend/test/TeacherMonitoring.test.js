const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const Service = require('../services/SectionDetailsService');
const Monitoring = require('../services/StudentMonitoringService');
const database = require('../config/db');
const User = require('../models/User');
const Model = require('../models/AtRiskPrediction');
const router = require('../routes/sectionDetailsRoutes');
const { fixture } = require('./fixtures/teacherMonitoring');
const request = changes => ({ assignmentType: 'teaching', assignmentId: 1, userId: 10, term: 'T1', ...changes });
const now = new Date('2026-11-11T00:00:00Z');
const neverPredict = { getPreview: () => assert.fail('Monitoring must never invoke the model') };

test('English, Mathematics, Science and MAPEH reuse exactly the Principal academic results, including unsubmitted records', async () => {
  for (const code of ['ENG', 'MATH', 'SCI', 'MAPEH']) {
    const f = fixture({ code });
    const result = await Service.getSectionDetails(request({ assignmentId: f.assignment.assignment_id }), f.database,
      { now, predictionService: neverPredict });
    const principal = await Monitoring.getPreview(f.database, { schoolYear: '3', subject: String(f.assignment.subject_id), term: 'T1' }, now, { academicOnly: true });
    assert.deepEqual(result.learners.map(row => row.academic), principal.students.map(row => row.academic), code);
    assert.ok(result.learners.every(row => row.academic.status === 'available' && row.termGrade === null));
    assert.equal(result.summary.missingDisplayGradeCount, 0);
    assert.equal(Object.values(result.summary.performanceBands).reduce((sum, row) => sum + row.count, 0), 2);
    assert.equal(result.capabilities.predictionReady, false);
    assert.ok(f.calls.every(row => /^\s*SELECT/.test(row.sql)));
    const scoped = f.calls.filter(row => row.sql.includes('AND so.subject_offering_id = ?')
      && (row.sql.includes("CONCAT_WS(', ', st.last_name") || row.sql.includes('JOIN GRADE_ACTIVITY')));
    assert.equal(scoped.length, 2);
    assert.ok(scoped.every(row => row.params.at(-1) === f.assignment.subject_offering_id));
    assert.ok(f.calls.every(row => !/FROM (ATTENDANCE|PHIL_IRI)/.test(row.sql)));
  }
});

test('missing, invalid and duplicate records withhold both the monitoring band and grade', async () => {
  for (const options of [{ noScores: true }, { invalidScore: true }, { duplicateSheet: true }, { duplicateOffering: true }]) {
    const f = fixture(options);
    const result = await Service.getSectionDetails(request(), f.database, { now, predictionService: neverPredict });
    assert.ok(result.learners.every(row => row.academic.status === (options.noScores ? 'needs_records' : 'review')
      && row.academic.gradePreview === null && row.academic.riskLevel === null));
    assert.equal(result.summary.missingDisplayGradeCount, 2);
  }
});

test('prediction readiness requires a completed valid calendar and one submitted, locked sheet', async () => {
  for (const options of [{ submitted: true, ongoing: true }, { submitted: false }, { submitted: true, duplicateSheet: true }]) {
    const f = fixture(options);
    const result = await Service.getSectionDetails(request({ riskMode: 'prediction' }), f.database, { now, predictionService: neverPredict });
    assert.equal(result.context.riskMode, 'monitoring');
    assert.equal(result.capabilities.predictionReady, false);
    assert.equal(result.capabilities.predictionUnavailableLabel, options.ongoing ? 'Ongoing term'
      : options.duplicateSheet ? 'Grade sheets need review' : 'Grades need to be submitted');
    assert.match(result.notice, /Showing current-term monitoring/);
    assert.ok(result.learners.every(row => row.academic.status !== undefined));
  }
  const f = fixture({ submitted: true });
  const result = await Service.getSectionDetails(request({ riskMode: 'prediction' }), f.database, { now,
    predictionService: { getPreview: async (filters, options) => {
      assert.equal(filters.term, 'T2');
      assert.deepEqual(options.scope, { schoolYearId: 3, sectionId: 7, subjectOfferingId: 101 });
      return { sourceTerm: 'T1', targetTerm: 'T2', students: [{ studentSectionId: 501, schoolYearId: 3, sectionId: 7, riskLevel: 'medium' }],
        unavailable: [{ studentSectionId: 502, schoolYearId: 3, sectionId: 7, status: 'insufficient_data', missingSources: ['attendance', 'phil_iri'], reason: 'Attendance and PHIL-IRI needed.' }] };
    } },
  });
  assert.equal(result.context.riskMode, 'prediction');
  assert.equal(result.learners[0].termGrade, 84);
  assert.equal(result.learners[0].riskAssessment.label, 'Medium Risk');
  assert.equal(result.learners[1].riskAssessment.label, 'Insufficient data');
  assert.equal(result.learners[1].termGrade, 90);
});

test('authorization, English exclusivity, Term 3, and the UTC term-end boundary are enforced', async () => {
  const f = fixture({ submitted: true });
  await assert.rejects(Service.getSectionDetails(request({ userId: 999 }), f.database), error => error.code === 'SECTION_DETAILS_FORBIDDEN');
  const science = fixture({ code: 'SCI' });
  await assert.rejects(Service.getSectionDetails(request({ riskMode: 'prediction' }), science.database), error => error.code === 'PREDICTION_ENGLISH_ONLY');
  const t3 = await Service.getSectionDetails(request({ term: 'T3' }), f.database, { now, predictionService: neverPredict });
  assert.equal(t3.context.riskMode, 'monitoring');
  assert.equal(t3.capabilities.predictionReady, false);
  assert.equal(t3.capabilities.predictionUnavailableLabel, 'No next term');
  const response = await Service.getSectionDetails(request(), f.database, { now });
  response.context.selectedTerm.endsAt = '2026-09-01 05:00:00';
  for (const [at, expected] of [['2026-09-01T04:59:59.999Z', false], ['2026-09-01T05:00:00Z', true]]) {
    assert.equal(Service.predictionReadiness(response, [f.sheet()], new Date(at)).ready, expected);
  }
  assert.equal(Service.predictionReadiness(response, [{ ...f.sheet(), lock_status: 'EDITABLE' }], now).label, 'Grades await finalization');
});

test('the actual HTTP endpoint produces the frontend contract and preserves it on reopening fallback', async () => {
  const f = fixture({ submitted: true });
  const originalExecute = database.execute, originalFind = User.findById, originalPredict = Model.getPreview;
  const { isSectionDetailsView } = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/sectionDetailsPresentation.js')));
  let server;
  try {
    database.execute = f.database.execute;
    User.findById = async () => ({ user_id: 10, role: 'subject_teacher', account_status: 'ACTIVE' });
    Model.getPreview = async () => ({ sourceTerm: 'T1', targetTerm: 'T2', students: f.enrollments.map(studentSectionId => ({
      studentSectionId, sectionId: 7, schoolYearId: 3, riskLevel: 'low',
    })), unavailable: [] });
    const app = express(); app.use('/api/section-details', router);
    server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    const read = async riskMode => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/section-details/teaching/1?term=T1&riskMode=${riskMode}&viewVersion=${Service.VIEW_VERSION}`, {
        headers: { 'X-Auralis-User-Id': '10' },
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(isSectionDetailsView(data, { assignmentType: 'teaching', assignmentId: 1, term: 'T1', riskMode }), true);
      return data;
    };
    const monitoring = await read('monitoring');
    assert.equal(monitoring.learners[0].academic.status, 'available');
    assert.equal((await read('prediction')).context.riskMode, 'prediction');
    f.state.submitted = false;
    assert.equal((await read('prediction')).context.riskMode, 'monitoring');
    const malformed = structuredClone(monitoring);
    delete malformed.learners[0].academic.gradePreview;
    assert.equal(isSectionDetailsView(malformed, { assignmentType: 'teaching', assignmentId: 1, term: 'T1', riskMode: 'monitoring' }), false);
    const old = await fetch(`http://127.0.0.1:${server.address().port}/api/section-details/teaching/1?viewVersion=old`, { headers: { 'X-Auralis-User-Id': '10' } });
    assert.equal(old.status, 409);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    database.execute = originalExecute; User.findById = originalFind; Model.getPreview = originalPredict;
  }
});
