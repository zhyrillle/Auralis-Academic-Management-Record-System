// Uses an in-memory database substitute. Never imports the school database connection.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const user = { user_id: 45, normalized_role: 'department_head', department_id: 9 };
const department = { department_id: 9, department_name: 'English', department_code: 'ENG' };
const subject = { subject_id: 33, subject_name: 'English', subject_code: 'ENG' };
const section = { section_id: 7, section_name: 'Carrots', grade_level_id: 2, grade_level_name: 'G8',
  learner_count: 3, subject_offering_id: 88, first_name: 'Demo', last_name: 'Teacher', is_specialized: 0,
  adviser_first_name: 'Demo', adviser_last_name: 'Adviser' };
const screening = { student_section_id: 101, literal_max: 14, inferential_max: 12, critical_max: 14,
  test_taken: 1, literal_score: 0, inferential_score: 2, critical_score: 3 };
const post = { student_section_id: 101, oral_reading_percent: 80, comp_score_percent: 50,
  oral_reading_level: 'FRUSTRATION', comp_reading_level: 'FRUSTRATION', overall_reading_level: 'FRUSTRATION' };
function harness(overrides = {}) {
  const calls = [];
  const module = { exports: {} };
  const db = { execute: async (sql, params) => {
    assert.match(sql, /^\s*SELECT/i, 'monitoring may only read existing records');
    assert.equal((sql.match(/\?/g) || []).length, params?.length || 0, 'placeholder count must match');
    calls.push({ sql, params });
    if (sql.includes('FROM DEPARTMENT d')) return [overrides.departments ?? [department]];
    if (sql.includes('FROM SUBJECT WHERE')) return [overrides.subjects ?? [subject]];
    if (sql.includes('FROM SCHOOL_YEAR')) return [[{ school_year_id: 12, starts_on: 2026, ends_on: 2027, status: 'ongoing' }]];
    if (sql.includes('FROM SCHOOL ORDER')) return [[{ school_name: 'Gingoog City Comprehensive National High School', region: '10', division: 'Gingoog City' }]];
    if (sql.includes('FROM GRADE_LEVEL')) return [[{ grade_level_id: 2, grade_level_name: 'G8' }]];
    if (sql.includes('FROM SUBJECT_OFFERING so JOIN SECTION')) return [[section]];
    if (sql.includes('FROM PHIL_IRI_SCREENING')) {
      if (overrides.screeningError) throw overrides.screeningError;
      return [overrides.screenings ?? [screening, { ...screening, student_section_id: 102, critical_score: null }]];
    }
    if (sql.includes('FROM PHIL_IRI_ASSESSMENT')) return [overrides.posts ?? [post]];
    if (sql.includes('FROM STUDENT_SECTION ss')) return [[101, 102, 103].map(student_section_id => ({ student_section_id,
      section_id: 7, lrn: 'encrypted', first_name: 'Demo', last_name: String(student_section_id),
      sex: student_section_id === 101 ? 'M' : student_section_id === 102 ? 'F' : null }))];
    throw new Error(`Unexpected query ${sql}`);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/DeptHeadMonitoringService.js'), 'utf8'), {
    module, require: name => {
      if (name === '../config/db') return db;
      if (name === '../utils/encryption') return { decryptLrn: () => '123456789012' };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { ...module.exports, calls };
}

test('unrelated roles and missing department assignments cannot use monitoring', async () => {
  const wrongRole = harness();
  await assert.rejects(wrongRole.DeptHeadMonitoringService.context({ ...user, normalized_role: 'subject_teacher' }), error => error.status === 403);
  assert.equal(wrongRole.calls.length, 0);
  await assert.rejects(harness({ departments: [] }).DeptHeadMonitoringService.context(user), error => error.status === 403);
});
test('assigned subject is resolved automatically; ambiguous departments never default to English', async () => {
  const h = harness({ subjects: [{ subject_id: 34, subject_code: 'RES', subject_name: 'Research' }, subject] });
  const context = await h.DeptHeadMonitoringService.context(user);
  assert.equal(context.subject.subjectId, 33);
  assert.equal(context.canViewPhilIri, true);
  assert.equal(context.school.region, '10');
  await assert.rejects(harness({ subjects: [{ subject_code: 'X' }, { subject_code: 'Y' }] }).DeptHeadMonitoringService.context(user), error => error.status === 409);
});
test('directory reads use assigned subject and selected year with no full class-record queries', async () => {
  const h = harness(); const data = await h.DeptHeadMonitoringService.sections(user, 12);
  assert.equal(data.sections[0].learnerCount, 3);
  assert.equal(data.sections[0].teacherName, 'Demo Teacher');
  assert.equal(data.sections[0].adviserName, 'Demo Adviser');
  assert.match(h.calls.at(-1).sql, /saa2.school_year_id = so.school_year_id/);
  assert.equal(data.sections[0].programCode, 'EBEC');
  assert.deepEqual(Array.from(h.calls.at(-1).params), [33, 12]);
  assert.ok(h.calls.every(call => !call.sql.includes('SCORE')));
  await assert.rejects(h.DeptHeadMonitoringService.sections(user, 0), error => error.status === 400);
  await assert.rejects(h.DeptHeadMonitoringService.sections(user, 99), error => error.status === 404);
});
test('PHIL-IRI rejects other departments and out-of-scope sections', async () => {
  const math = harness({ departments: [{ ...department, department_name: 'Mathematics', department_code: 'MATH' }],
    subjects: [{ ...subject, subject_name: 'Mathematics', subject_code: 'MATH' }] });
  await assert.rejects(math.DeptHeadMonitoringService.philIri(user, 12), error => error.status === 403);
  assert.ok(math.calls.every(call => !call.sql.includes('PHIL_IRI')));
  const english = harness();
  await assert.rejects(english.DeptHeadMonitoringService.philIri(user, 12, 999), error => error.status === 403);
});
test('screening keeps genuine zero scores, incomplete assessments, and unassessed learners distinct', async () => {
  const h = harness(); const data = await h.DeptHeadMonitoringService.philIri(user, 12, 7);
  assert.equal(data.learners[0].screeningStatus, 'Complete');
  assert.equal(data.learners[0].screening.literal_score, 0);
  assert.equal(data.learners[1].screeningStatus, 'Incomplete');
  assert.equal(data.learners[2].screeningStatus, 'Not assessed');
  assert.equal(data.sections[0].screeningComplete, 1);
  assert.equal(data.sections[0].screeningIncomplete, 1);
  assert.equal(data.sections[0].postTestComplete, 1);
  assert.equal(data.learners[0].lrn, '123456789012');
  assert.deepEqual(Array.from(data.learners, learner => learner.sex), ['M', 'F', null]);
  const postQuery = h.calls.find(call => call.sql.includes('FROM PHIL_IRI_ASSESSMENT'));
  assert.deepEqual(Array.from(postQuery.params), [12, 33, 7, 33]);
  assert.match(postQuery.sql, /po.school_year_id = ss.school_year_id/);
});
test('summaries do not expose the learner list or count missing post-tests as incomplete', async () => {
  const result = await harness().DeptHeadMonitoringService.philIri(user, 12);
  assert.equal(result.learners, undefined);
  assert.equal(result.sections[0].postTestIncomplete, 0);
  assert.equal(result.sections[0].learnerCount, 3);
});
test('missing assessment tables are unavailable, while database failures remain errors', async () => {
  const unavailable = await harness({ screeningError: { code: 'ER_NO_SUCH_TABLE' } }).DeptHeadMonitoringService.philIri(user, 12, 7);
  assert.equal(unavailable.availability.screening, false);
  assert.equal(unavailable.sections[0].screeningComplete, null);
  assert.equal(unavailable.learners[0].screeningStatus, 'Unavailable');
  await assert.rejects(harness({ screeningError: new Error('Connection lost') }).DeptHeadMonitoringService.philIri(user, 12), /Connection lost/);
});

test('screening and post-test outcomes are counted separately; incomplete and absent results are excluded', async () => {
  const h = harness({ screenings: [{ ...screening, score_threshold: 5 }, { ...screening, student_section_id: 102, score_threshold: 6 }],
    posts: [{ ...post, overall_reading_level: 'INDEPENDENT' }, { ...post, student_section_id: 102 }] });
  const result = await h.DeptHeadMonitoringService.philIri(user, 12);
  const row = result.sections[0];
  assert.equal(row.screeningPassed, 1);
  assert.equal(row.screeningFailed, 1);
  assert.equal(row.postTestIndependent, 1);
  assert.equal(row.postTestFrustration, 1);
  assert.equal(row.learnerCount, 3);
  assert.equal(result.learners, undefined);
  const missing = await harness({ screenings: [], posts: [] }).DeptHeadMonitoringService.philIri(user, 12);
  assert.equal(missing.sections[0].screeningFailed, 0);
  assert.equal(missing.sections[0].postTestFrustration, 0);
});

test('post-test preserves all three reading levels and screening includes the threshold boundary', async () => {
  const posts = ['INDEPENDENT', 'INSTRUCTIONAL', 'FRUSTRATION'].map((level, index) => ({ ...post, student_section_id: 101 + index, overall_reading_level: level }));
  const screenings = [27, 28, 29].map((total, index) => ({ ...screening, student_section_id: 101 + index,
    literal_score: 10, inferential_score: 10, critical_score: total - 20, score_threshold: 28 }));
  const result = await harness({ posts, screenings }).DeptHeadMonitoringService.philIri(user, 12);
  const row = result.sections[0];
  assert.equal(row.screeningFailed, 1);
  assert.equal(row.screeningPassed, 2);
  assert.equal(row.postTestIndependent, 1);
  assert.equal(row.postTestInstructional, 1);
  assert.equal(row.postTestFrustration, 1);
});

test('screening pass counts use each saved threshold rather than a fixed cutoff', async () => {
  const screenings = [4, 5, 6].map((threshold, index) => ({ ...screening, student_section_id: 101 + index, score_threshold: threshold }));
  const result = await harness({ screenings }).DeptHeadMonitoringService.philIri(user, 12);
  assert.equal(result.sections[0].screeningPassed, 2);
  assert.equal(result.sections[0].screeningFailed, 1);
});
