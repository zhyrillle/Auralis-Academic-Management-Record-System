const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const plain = value => JSON.parse(JSON.stringify(value));
function learner(id = 1, changes = {}) {
  return { profile: { id: String(id), grade: 8, screeningStatus: 'available',
    screeningAssessmentDate: '2026-06-15', attendanceStatus: 'available',
    attendanceSummary: { absentDays: 2, classDays: 40 }, ...changes.profile },
  features: { ww_pct: 80, pt_pct: 80, qa_pct: 75, previous_final_grade: 80,
    phil_iri_literal_pct: 50, phil_iri_inferential_pct: 75, phil_iri_critical_pct: 0,
    phil_iri_unavailable: 0, absence_rate: 0.05, ...changes.features } };
}

function harness({ eligible = [], unavailable = [], sourceError, modelError } = {}) {
  const calls = [], module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../models/AtRiskPrediction.js'), 'utf8'), {
    module, require: name => {
      if (name === '../config/db') return {};
      if (name === '../services/EnglishRiskFeatures') return { loadInputs: async () => {
        if (sourceError) throw sourceError;
        return { eligible, unavailable, schoolYear: '2026-2027', sourceTerm: 'T1', targetTerm: 'T2' };
      } };
      if (name === '../services/EnglishRiskModel') return { predict: async rows => {
        calls.push(plain(rows));
        if (modelError) throw modelError;
        return { modelVersion: 'test', threshold: 0.35,
          predictions: rows.map(() => ({ score: 0.55, riskLevel: 'medium', predictedAtRisk: true })) };
      } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { model: module.exports, calls };
}
const filters = { schoolYear: '2026-2027', term: 'T2' };

test('complete recorded inputs reach the worker unchanged and use its prediction', async () => {
  const row = learner(), h = harness({ eligible: [row] });
  const result = plain(await h.model.getPreview(filters));
  assert.deepEqual(h.calls, [[row.features]]);
  assert.deepEqual(result.students[0].modelInputs, row.features);
  assert.deepEqual(result.students[0].missingInputs, []);
  assert.equal(result.students[0].riskLevel, 'medium');
  assert.equal(result.students[0].score, 0.55);
  assert.equal(result.students[0].predictedAtRisk, true);
  assert.match(result.students[0].flags[1].label, /Screening sub-scores recorded/);
  assert.match(result.students[0].flags[2].label, /2 absent days across 40 recorded class days/);
  assert.equal(result.automaticAlertsEnabled, false);
  assert.equal(result.termTransferValidated, false);
  assert.doesNotMatch(result.warnings.join(' '), /use training medians|use the training median/);
});

test('missing attendance, screening or both withhold labels and preserve source reasons', async () => {
  const eligible = [
    learner(1, { profile: { attendanceStatus: 'unavailable', attendanceReason: 'Attendance is incomplete for 3 weekdays.' },
      features: { absence_rate: null } }),
    learner(2, { profile: { screeningStatus: 'unavailable', screeningReason: 'Screening assessment date is missing or invalid.' },
      features: { phil_iri_literal_pct: null, phil_iri_inferential_pct: null, phil_iri_critical_pct: null, phil_iri_unavailable: 1 } }),
    learner(3, { profile: { attendanceStatus: 'unavailable', screeningStatus: 'unavailable' },
      features: { absence_rate: null, phil_iri_literal_pct: null, phil_iri_inferential_pct: null, phil_iri_critical_pct: null, phil_iri_unavailable: 1 } }),
  ];
  const h = harness({ eligible });
  const result = plain(await h.model.getPreview(filters));
  assert.deepEqual(h.calls, [[]], 'An empty batch still checks model health without scoring withheld learners');
  assert.equal(result.students.length, 0);
  assert.deepEqual(result.unavailable.map(row => row.missingSources), [['attendance'], ['phil_iri'], ['attendance', 'phil_iri']]);
  assert.match(result.unavailable[0].reason, /Attendance needed:.*3 weekdays/);
  assert.match(result.unavailable[1].reason, /PHIL-IRI needed:.*date is missing/);
  assert.match(result.unavailable[2].reason, /Attendance needed:.*PHIL-IRI needed:/);
  for (const row of result.unavailable) {
    assert.equal(row.status, 'insufficient_data');
    for (const key of ['score', 'riskScore', 'riskLevel', 'predictedAtRisk']) assert.equal(Object.hasOwn(row, key), false);
  }
  assert.deepEqual(result.summary, { lowRisk: 0, mediumRisk: 0, highRisk: 0, total: 0, unavailable: 3, eligible: 0, totalEnglish: 3 });
});

test('zero absences and zero screening scores remain valid recorded inputs', async () => {
  const row = learner(1, { profile: { attendanceSummary: { absentDays: 0, classDays: 40 } },
    features: { absence_rate: 0, phil_iri_literal_pct: 0, phil_iri_inferential_pct: 0 } });
  const h = harness({ eligible: [row] });
  const result = await h.model.getPreview(filters);
  assert.deepEqual(h.calls[0], [row.features]);
  assert.equal(result.students.length, 1);
});

test('source availability and valid feature values are both required', async () => {
  for (const changes of [
    { profile: { attendanceStatus: 'unavailable' } },
    { profile: { screeningStatus: 'unavailable' } },
    { features: { absence_rate: null } }, { features: { absence_rate: NaN } }, { features: { absence_rate: 1.1 } },
    { features: { phil_iri_unavailable: 1 } }, { features: { phil_iri_literal_pct: null } },
    { features: { phil_iri_inferential_pct: -1 } }, { features: { phil_iri_critical_pct: 101 } },
  ]) {
    const h = harness({ eligible: [learner(1, changes)] });
    const result = await h.model.getPreview(filters);
    assert.deepEqual(h.calls, [[]]);
    assert.equal(result.unavailable[0].status, 'insufficient_data');
  }
});

test('mixed batches count scored and withheld learners once and preserve academic exclusions', async () => {
  const academic = { id: '3', grade: 7, reason: 'Previous English grade sheet is not submitted and term-locked.' };
  const h = harness({ eligible: [learner(), learner(2, { features: { absence_rate: null } })], unavailable: [academic] });
  const result = plain(await h.model.getPreview(filters));
  assert.equal(h.calls[0].length, 1);
  assert.deepEqual(result.summary, { lowRisk: 0, mediumRisk: 1, highRisk: 0, total: 1, unavailable: 2, eligible: 1, totalEnglish: 3 });
  assert.deepEqual(result.unavailable[0], academic);
  assert.equal(result.distribution.medium.count, 1);
  assert.equal(result.distribution.totalFlagged, 1);
  assert.deepEqual(result.gradeBreakdown, [{ grade: 'Grade 8', low: 0, medium: 1, high: 0 }]);
  assert.equal((await h.model.getSummary(filters)).unavailable, 2);
  assert.equal((await h.model.getStudentsByRiskLevel({ ...filters, riskLevel: 'medium' })).totalCount, 1);
  assert.equal((await h.model.getBreakdownData(filters)).summary.totalEnglish, 3);
});

test('database and model failures remain errors, including entirely withheld batches', async () => {
  await assert.rejects(harness({ sourceError: new Error('Database unavailable') }).model.getPreview(filters), /Database unavailable/);
  const h = harness({ eligible: [learner(1, { features: { absence_rate: null } })], modelError: new Error('Model unavailable') });
  await assert.rejects(h.model.getPreview(filters), /Model unavailable/);
  assert.deepEqual(h.calls, [[]]);
});
