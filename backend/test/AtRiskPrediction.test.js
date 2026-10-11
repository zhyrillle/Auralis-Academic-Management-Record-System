const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('prediction sends actual attendance to the worker and distinguishes it from missing values', async () => {
  const features = { ww_pct: 80, pt_pct: 80, qa_pct: 75, previous_final_grade: 80,
    phil_iri_literal_pct: 50, phil_iri_inferential_pct: 75, phil_iri_critical_pct: 0,
    phil_iri_unavailable: 0, absence_rate: null };
  const eligible = [
    { profile: { grade: 8, screeningAssessmentDate: '2026-06-15',
      attendanceStatus: 'available', attendanceSummary: { absentDays: 2, classDays: 40 } },
      features: { ...features, absence_rate: 0.05 } },
    { profile: { grade: 8, screeningReason: 'Screening assessment date is missing or invalid.' },
      features: { ...features, phil_iri_literal_pct: null, phil_iri_inferential_pct: null,
        phil_iri_critical_pct: null, phil_iri_unavailable: 1 } },
  ];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../models/AtRiskPrediction.js'), 'utf8'), {
    module, require: name => {
      if (name === '../config/db') return {};
      if (name === '../services/EnglishRiskFeatures') return {
        loadInputs: async () => ({ eligible, unavailable: [], schoolYear: '2026-2027', sourceTerm: 'T1', targetTerm: 'T2' }),
      };
      if (name === '../services/EnglishRiskModel') return {
        predict: async rows => {
          assert.equal(rows[0].absence_rate, 0.05);
          assert.equal(rows[1].absence_rate, null);
          return { modelVersion: 'test', threshold: 0.35, predictions: rows.map(() => ({ score: 0.1, riskLevel: 'low', predictedAtRisk: false })) };
        },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const result = await module.exports.getPreview({ schoolYear: '2026-2027', term: 'T2' });
  assert.deepEqual(Array.from(result.students[0].missingInputs), []);
  assert.match(result.students[0].flags[1].label, /Screening sub-scores recorded \(2026-06-15\)/);
  assert.doesNotMatch(result.students[0].flags[1].label, /unavailable|median/i);
  assert.equal(result.students[1].missingInputs.length, 4);
  assert.equal(result.students[0].modelInputs.previous_final_grade, 80);
  assert.equal(result.students[0].modelInputs.phil_iri_critical_pct, 0);
  assert.equal(result.students[0].modelInputs.absence_rate, 0.05);
  assert.match(result.students[0].flags[2].label, /2 absent days across 40 recorded class days/);
  assert.match(result.students[1].flags[2].label, /incomplete or need review/);
  assert.equal(result.students[1].modelInputs.absence_rate, null);
  assert.ok(result.warnings.every(warning => !warning.includes('All preview records use')));
  assert.equal(result.students[1].modelInputs.phil_iri_literal_pct, null);
  assert.match(result.students[1].flags[1].label, /date is missing.*Training medians/);
  assert.equal(result.automaticAlertsEnabled, false);
  assert.equal(result.termTransferValidated, false);
});
