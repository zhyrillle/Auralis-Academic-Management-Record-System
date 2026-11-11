const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { computeProgress } = require('../services/MonitoringProgress');
const { calculateGrades } = require('../services/GradeComputationService');
const { TRANSMUTATION_TABLE } = require('../utils/depedTransmutation');
const config = { is_custom_enabled: true, ranges: TRANSMUTATION_TABLE };
const weights = values => ['WW', 'PT', 'EX'].map((component_code, i) => ({ component_code, percentage: values[i] }));
const names = ['Written Work 1', 'Performance Task 1', 'Summative Test 1', 'Summative Test 2', 'Term Exam'];
const codes = ['WW', 'PT', 'EX', 'EX', 'EX'];
const activity = (id, score, maximum, changes = {}) => ({ activity_id: id, score_id: id,
  activity_name: names[(id - 1) % 5], component_code: codes[(id - 1) % 5],
  highest_possible_score: maximum, raw_score: score, score_status: 'ENCODED',
  student_section_id: 1, status: 'ACTIVE', ...changes });
const preview = (activities, values = [30, 50, 20], changes = {}) => computeProgress({ activities,
  weightRows: weights(values), transmutationConfig: config, asOf: '2026-11-11', ...changes });

test('Class Record intermediate rounding controls the passing-grade boundary', () => {
  const values = [[23, 27], [61, 91], [47, 125], [29, 57], [47, 67]];
  const result = preview(values.map(([score, max], i) => activity(i + 1, score, max)));
  assert.equal(result.progress, 70);
  assert.equal(result.gradePreview, 75);
  assert.equal(result.riskLevel, 'moderate');
  assert.deepEqual(result.components.map(row => row.weightedPoints), [25.56, 33.52, 10.92]);
});

test('one recorded component retains available-weight normalization', () => {
  const result = preview([activity(1, 20, 20)], [40, 40, 20]);
  assert.equal(result.weightedPoints, 40);
  assert.equal(result.availableWeight, 40);
  assert.equal(result.progress, 100);
  assert.equal(result.gradePreview, 100);
});

test('unrecorded, excused and future work are excluded, while confirmed missing work counts as zero', () => {
  const first = activity(1, 20, 20);
  const second = activity(6, null, 20, { score_id: null, score_status: 'NOT_ENCODED' });
  assert.equal(preview([first, second]).progress, 100);
  assert.equal(preview([first, { ...second, score_id: 6, score_status: 'EXCUSED' }]).progress, 100);
  assert.equal(preview([first, { ...second, activity_date: '2026-11-12' }]).progress, 100);
  const missing = preview([first, { ...second, score_id: 6, score_status: 'MISSING' }]);
  assert.equal(missing.progress, 50);
  assert.equal(missing.components[0].confirmedMissing, 1);
});

test('a partial examination uses only its represented share', () => {
  const result = preview([activity(3, 15, 30)]);
  assert.equal(result.availableWeight, 6);
  assert.equal(result.weightedPoints, 3);
  assert.equal(result.progress, 50);
  assert.equal(result.components.find(row => row.code === 'EX').percent, 50);
  const mapeh = preview([activity(3, 3, 3, { mapeh_component: 'MA' })], [20, 60, 20], { isMapeh: true });
  assert.equal(mapeh.progress, 100);
  assert.equal(mapeh.gradePreview, 100);
});

test('invalid and duplicate marks still withhold a preview', () => {
  for (const activities of [[activity(1, 21, 20)], [activity(1, 10, 20), activity(1, 10, 20)]]) {
    const result = preview(activities);
    assert.equal(result.status, 'review');
    assert.equal(result.gradePreview, null);
    assert.equal(result.riskLevel, null);
  }
});

test('complete records match the actual frontend and submission calculators across weights and conversion modes', async () => {
  // Only the browser API URL import is stubbed; all frontend grading functions are unchanged.
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/utils/depedTransmutation.js'), 'utf8')
    .replace('import { API_BASE_URL } from "../services/apiConfig";', 'const API_BASE_URL = "";');
  const frontend = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  let seed = 41389;
  const next = maximum => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % maximum; };
  for (const values of [[30, 50, 20], [40, 40, 20], [20, 60, 20]]) {
    const isMapeh = values[1] === 60;
    for (const transmutationConfig of [config, { is_custom_enabled: false, ranges: [] }]) {
      for (let sample = 0; sample < 1000; sample++) {
        const groups = isMapeh ? ['MA', 'PEH'] : [null];
        const activities = groups.flatMap((group, index) => names.map((name, i) => {
          const max = next(150) + 1;
          return activity(index * 5 + i + 1, next(max + 1), max, { mapeh_component: group });
        }));
        const gradeRows = calculateGrades({ offering: { subject_code: isMapeh ? 'MAPEH' : 'ENG' },
          students: [{ student_id: 1, student_section_id: 1 }], weights: weights(values),
          activities, scores: activities, config: transmutationConfig });
        const submission = gradeRows.find(row => row.mapehComponent === null);
        const displayGrades = groups.map(group => {
          const own = activities.filter(row => row.mapeh_component === group);
          const raw = Object.fromEntries(own.map(row => [row.activity_id, row.raw_score]));
          return frontend.calculateStudentGrades({
            writtenWorkColumns: [{ id: own[0].activity_id, max_score: own[0].highest_possible_score }],
            writtenWorks: raw,
            performanceTaskColumns: [{ id: own[1].activity_id, max_score: own[1].highest_possible_score }],
            performanceTasks: raw,
            examinations: { st1: own[2].raw_score, st2: own[3].raw_score, te: own[4].raw_score },
            examConfig: { st1HPS: own[2].highest_possible_score, st2HPS: own[3].highest_possible_score,
              teHPS: own[4].highest_possible_score, st1Weight: 30, st2Weight: 30, teWeight: 40 },
            weights: { WW: values[0], PT: values[1], EX: values[2] }, isMapeh, transmutationConfig,
          }).termGrade;
        });
        const displayed = Math.round(displayGrades.reduce((sum, value) => sum + value, 0) / displayGrades.length);
        const result = preview(activities, values, { isMapeh, transmutationConfig });
        assert.equal(result.gradePreview, submission.termGrade, JSON.stringify({ values, sample, activities }));
        assert.equal(result.gradePreview, displayed);
        assert.equal(result.progress, submission.initialGrade);
      }
    }
  }
});
