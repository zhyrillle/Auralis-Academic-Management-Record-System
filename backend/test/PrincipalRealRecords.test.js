// Isolated read-only SQL substitutes. Never import config/db or touch the school DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const years = [2026, 2025].map(year => ({ starts_on: year, ends_on: year + 1 }));
const grades = [0, 88].map((grade, index) => ({
  student_id: 101, subject_id: 1, subject_name: 'English', subject_code: 'ENG',
  subject_offering_id: 12, section_id: 7, grade_level_id: 1, grade_level_name: 'G7',
  starts_on: 2026, term: index ? 'T3' : 'T1', grade,
}));
function harness(file, { empty = false, fail = '', gradeRows = grades } = {}) {
  const handlers = new Map(); const calls = [];
  const module = { exports: {} };
  const db = { execute: async (sql, params = []) => {
    assert.match(sql, /^\s*SELECT/i, 'these tests must never issue a write');
    calls.push(sql);
    if (fail && sql.includes(fail)) throw new Error('Synthetic database failure');
    if (sql.includes('FROM SCHOOL_YEAR')) return [empty ? [] : years];
    if (sql.includes('FROM ACADEMIC_TERM')) return [[]];
    if (sql.includes('FROM GRADE_LEVEL')) return [empty ? [] : [7, 8, 9, 10].map((grade, i) => ({ grade_level_id: i + 1, grade_level_name: 'G' + grade }))];
    if (sql.includes('FROM STUDENT_GRADE')) return [empty ? [] : gradeRows];
    if (sql.includes('FROM SECTION sec')) return [empty ? [] : [{ section_id: 7, section_name: 'Test Section', grade_level_id: 1, grade_level_name: 'G7', learners: 1 }]];
    if (sql.includes('FROM TEACHER_ASSIGNMENT')) return [empty ? [] : [{ user_id: 42, first_name: 'Test', last_name: 'Teacher', subject_offering_id: 12, subject_name: 'English', subject_code: 'ENG', section_id: 7, section_name: 'Test Section', grade_level_id: 1, grade_level_name: 'G7' }]];
    if (sql.includes('FROM GRADE_SHEET')) return [[]];
    if (sql.includes('FROM SUBJECT')) return [empty ? [] : [{ subject_id: 1, subject_name: 'English', subject_code: 'ENG' }]];
    if (sql.includes('FROM FEEDBACK')) return [[{ total_responses: 0, avg_rating: null, total_comments: 0 }]];
    throw new Error('Unexpected SQL: ' + sql);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../', file), 'utf8'), {
    module, console: { warn() {}, error() {} },
    require: name => {
      if (name === '../config/db') return db;
      if (name === 'express') return { Router: () => ({ get: (route, handler) => handlers.set(route, handler) }) };
      throw new Error('Unexpected dependency: ' + name);
    },
  });
  return { model: module.exports, calls, async request(route, query = {}) {
    const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handlers.get(route)({ query }, response);
    return { status: response.code, body: JSON.parse(JSON.stringify(response.body)) };
  }};
}

for (const route of ['/grade-levels', '/sections', '/subjects', '/teachers', '/lowest-performers']) {
  test('Performance ' + route + ' keeps empty results empty and propagates DB failures', async () => {
    const empty = await harness('routes/principalPerformanceRoutes.js', { empty: true }).request(route);
    assert.equal(empty.status, 200); assert.equal(empty.body.recordsVersion, 2);
    const key = route === '/grade-levels' ? 'gradeLevels' : route === '/lowest-performers' ? 'subjects' : route.slice(1);
    assert.equal(empty.body[key].length, 0);
    const failed = await harness('routes/principalPerformanceRoutes.js', { fail: 'FROM STUDENT_GRADE' }).request(route);
    assert.equal(failed.status, 500); assert.match(failed.body.error, /Unable to load/);
  });
}
test('Performance keeps recorded zero, four configured grades, and missing teacher terms distinct', async () => {
  const h = harness('routes/principalPerformanceRoutes.js');
  const zero = (await h.request('/grade-levels', { schoolYear: '2026-2027', term: 'term-1' })).body;
  assert.equal(zero.gradeLevels.length, 4); assert.equal(zero.gradeLevels[0].averageGrade, 0);
  assert.equal(zero.gradeLevels[0].gradedLearners, 1); assert.equal(zero.gradeLevels[1].status, 'No data');
  const teachers = (await h.request('/teachers', { schoolYear: '2026-2027' })).body;
  assert.deepEqual(teachers.teachers[0].termAverages, [0, 0, 88]);
  assert.deepEqual(teachers.teachers[0].termGradeCounts, [1, 0, 1]);
  assert.equal(teachers.teachers[0].averageGrade, 44);
});
test('Analytics has no invented subjects, grades, counts or school years', async () => {
  const h = harness('routes/principalAnalyticsRoutes.js', { empty: true });
  const data = (await h.request('/subject-trend')).body;
  assert.deepEqual(data.subjects, []); assert.deepEqual(data.schoolWideGradeCounts, [0, 0, 0]);
  assert.equal(data.totalLearners, 0); assert.deepEqual(data.availableSchoolYears, []);
});
test('Analytics uses only recorded values, retains zero and marks unavailable historical differences', async () => {
  const h = harness('routes/principalAnalyticsRoutes.js');
  const trend = (await h.request('/subject-trend', { schoolYear: '2026-2027' })).body;
  assert.equal(trend.subjects.length, 1);
  assert.deepEqual(trend.subjects[0].termAverages, [0, 0, 88]);
  assert.deepEqual(trend.subjects[0].termGradeCounts, [1, 0, 1]);
  const historical = (await h.request('/historical-comparison', { primarySchoolYear: '2026-2027', comparisonSchoolYear: '2025-2026' })).body;
  assert.equal(historical.subjects[0].primaryAverage, 44);
  assert.equal(historical.subjects[0].hasComparisonData, false); assert.equal(historical.subjects[0].difference, null);
  assert.equal(historical.overallDifference, null);
  const reversed = (await h.request('/historical-comparison', { primarySchoolYear: '2025-2026', comparisonSchoolYear: '2026-2027' })).body;
  assert.equal(reversed.subjects[0].hasPrimaryData, false); assert.equal(reversed.subjects[0].comparisonAverage, 44);
  const none = (await h.request('/historical-comparison', { primarySchoolYear: '2024-2025', comparisonSchoolYear: '2025-2026' })).body;
  assert.deepEqual(none.subjects, []); assert.equal(none.hasPrimaryData, false); assert.equal(none.hasComparisonData, false);
});
for (const route of ['/options', '/subject-trend', '/historical-comparison']) {
  test('Analytics ' + route + ' returns non-success on query failure', async () => {
    const response = await harness('routes/principalAnalyticsRoutes.js', { fail: 'FROM SCHOOL_YEAR' }).request(route);
    assert.equal(response.status, 500);
  });
}
test('Feedback empty success retains legitimate survey text; failures are not empty successes', async () => {
  const Feedback = harness('models/Feedback.js').model;
  const summary = await Feedback.getPrincipalFeedbackSummary('2026-2027');
  assert.equal(summary.totalResponses, 0); assert.equal(summary.overallRating, 0);
  const likert = await Feedback.getPrincipalLikertResults('2026-2027');
  assert.equal(likert.results.length, 8); assert(likert.results.every(row => row.rate === 0 && row.description.length > 20));
  assert.equal((await Feedback.getPrincipalFeedbackComments('2026-2027')).comments.length, 0);
  for (const fail of ['FROM ACADEMIC_TERM', 'FROM FEEDBACK']) {
    const broken = harness('models/Feedback.js', { fail }).model;
    for (const method of ['getPrincipalFeedbackSummary', 'getPrincipalLikertResults', 'getPrincipalFeedbackComments']) {
      await assert.rejects(broken[method]('2026-2027'), /Synthetic database failure/);
    }
  }
});
