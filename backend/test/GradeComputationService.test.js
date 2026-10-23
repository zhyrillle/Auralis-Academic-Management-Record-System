const test = require('node:test');
const assert = require('node:assert/strict');
const { computeTermGrade, transmuteInitialGrade } = require('../services/GradeComputationService');
const { TRANSMUTATION_TABLE } = require('../utils/depedTransmutation');
const off = { is_custom_enabled: false, ranges: [] };
const on = { is_custom_enabled: true, ranges: TRANSMUTATION_TABLE };
const weights = [
  { component_type_id: 1, component_code: 'WW', percentage: 30 },
  { component_type_id: 2, component_code: 'PT', percentage: 50 },
  { component_type_id: 3, component_code: 'EX', percentage: 20 },
];
const activity = (id, componentTypeId, hps, raw_score, score_status = 'ENCODED') => ({
  activity_id: id, component_type_id: componentTypeId, activity_name: 'Assessment',
  highest_possible_score: hps, status: 'ACTIVE',
  scores: [{ student_section_id: 10, raw_score, score_status }],
});
const activities = () => [activity(1, 1, 20, 18), activity(2, 2, 50, 40), activity(3, 3, 25, 20)];
const compute = changes => computeTermGrade({ weights, studentSectionId: 10, activities: activities(), config: off, ...changes });

test('transmutation uses the saved On/Off choice rather than a second hardcoded table', () => {
  assert.equal(transmuteInitialGrade(83, off), 83);
  assert.equal(transmuteInitialGrade(83, on), 85);
  assert.equal(transmuteInitialGrade(100, on), 100);
  assert.equal(transmuteInitialGrade(0, off), 0);
});
test('complete weighted grades match the shared frontend engine with transmutation Off and On', () => {
  const normal = compute();
  assert.equal(normal.complete, true); assert.equal(normal.initialGrade, 83); assert.equal(normal.termGrade, 83);
  assert.equal(compute({ config: on }).termGrade, 85);
});
test('MISSING counts as zero; an EXCUSED assessment requires an explicit policy review', () => {
  const values = activities(); values[0].scores[0] = { student_section_id: 10, raw_score: null, score_status: 'MISSING' };
  assert.equal(compute({ activities: values }).initialGrade, 56);
  values[0].scores[0].score_status = 'EXCUSED';
  assert.equal(compute({ activities: values }).reason, 'EXCUSED_SCORE_REVIEW');
});
test('not encoded, duplicate, invalid scores and missing activities produce no invented grades', () => {
  for (const change of [
    values => { values[0].scores[0].score_status = 'NOT_ENCODED'; },
    values => { values[0].scores.push({ ...values[0].scores[0] }); },
    values => { values[0].scores[0].raw_score = 21; },
    values => { values[0].scores[0].raw_score = NaN; },
    values => { values.pop(); },
  ]) {
    const values = activities(); change(values);
    const result = compute({ activities: values });
    assert.equal(result.complete, false); assert.equal(result.termGrade, null);
  }
});
test('invalid or absent subject weights block submission rather than using invented configuration', () => {
  const result = compute({ weights: weights.slice(0, 2) });
  assert.equal(result.complete, false); assert.equal(result.reason, 'INVALID_WEIGHTS');
});
test('zero scores remain a genuine zero with transmutation Off', () => {
  const values = activities(); values.forEach(a => { a.scores[0].raw_score = 0; });
  assert.equal(compute({ activities: values }).termGrade, 0);
});
