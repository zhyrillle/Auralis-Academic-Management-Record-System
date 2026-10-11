const test = require('node:test');
const assert = require('node:assert/strict');
const { academicFeatures, loadInputs, screeningFeatures, termCode, schoolYearRange } = require('../services/EnglishRiskFeatures');

const candidate = { student_section_id: 501, student_id: 41, section_id: 8, name: 'Test Learner', section: 'Demo',
  grade_level_name: 'Grade 8', subject_id: 1, subject_offering_id: 20, grade_sheet_id: 10,
  workflow_status: 'SUBMITTED', lock_status: 'TERM_LOCKED', quarterly_grade: 80 };
const weights = [{ subject_id: 1, component_code: 'WW', percentage: 20 },
  { subject_id: 1, component_code: 'PT', percentage: 50 }, { subject_id: 1, component_code: 'STE', percentage: 30 }];
const activities = () => [
  { activity_id: 1, component_code: 'WW', activity_name: 'Written Work', highest_possible_score: 20, raw_score: 16 },
  { activity_id: 2, component_code: 'PT', activity_name: 'Performance Task', highest_possible_score: 50, raw_score: 40 },
  { activity_id: 3, component_code: 'STE', activity_name: 'Summative Test 1', highest_possible_score: 10, raw_score: 5 },
  { activity_id: 4, component_code: 'STE', activity_name: 'Summative Test 2', highest_possible_score: 20, raw_score: 20 },
  { activity_id: 5, component_code: 'STE', activity_name: 'Term Exam', highest_possible_score: 80, raw_score: 60 },
].map(row => ({ ...row, grade_sheet_id: 10, student_section_id: 501, score_id: row.activity_id, score_status: 'ENCODED' }));

test('uses nine inputs, saved official grade and weighted EXS PS, not raw sum or WS', () => {
  const result = academicFeatures(candidate, activities(), weights);
  assert.equal(Object.keys(result.features).length, 9);
  assert.equal(result.features.ww_pct, 80);
  assert.equal(result.features.pt_pct, 80);
  assert.equal(result.features.qa_pct, 75); // .5*30 + 1*30 + .75*40
  assert.equal(result.features.previous_final_grade, 80);
  assert.equal(result.features.phil_iri_unavailable, 1);
  assert.equal(result.features.phil_iri_literal_pct, null);
  assert.equal(result.features.absence_rate, null);
  const changedWeights = weights.map(row => ({ ...row, percentage: row.component_code === 'WW' ? 30 : row.component_code === 'PT' ? 50 : 20 }));
  assert.equal(academicFeatures(candidate, activities(), changedWeights).features.qa_pct, 75);
});

test('rejects draft/reopened sheets, no official grade, unencoded and malformed scores', () => {
  for (const changes of [{ workflow_status: 'DRAFT' }, { lock_status: 'TEMPORARILY_REOPENED' }, { quarterly_grade: null }]) {
    assert.ok(academicFeatures({ ...candidate, ...changes }, activities(), weights).reason);
  }
  for (const changes of [{ raw_score: null }, { score_status: 'NOT_ENCODED' }, { raw_score: 999 }, { highest_possible_score: 0 }]) {
    const rows = activities(); rows[0] = { ...rows[0], ...changes };
    assert.ok(academicFeatures(candidate, rows, weights).reason);
  }
  assert.ok(academicFeatures(candidate, activities().slice(0, 4), weights).reason);
});

test('confirmed MISSING is zero, EXCUSED WW/PT is excluded, missing exams never become zero', () => {
  const rows = activities(); rows[0] = { ...rows[0], score_status: 'MISSING', raw_score: null };
  assert.equal(academicFeatures(candidate, rows, weights).features.ww_pct, 0);
  rows.push({ ...rows[0], activity_id: 6, score_id: 6, score_status: 'EXCUSED', highest_possible_score: 1000 });
  assert.equal(academicFeatures(candidate, rows, weights).features.ww_pct, 0);
  rows[2].score_id = null;
  assert.ok(academicFeatures(candidate, rows, weights).reason);
});

test('quarter names and Overall are not silently relabelled as terms', () => {
  assert.equal(termCode('1st'), 'T1');
  assert.equal(termCode('Term 2'), 'T2');
  assert.equal(termCode('3rd Term'), 'T3');
  for (const name of ['Q1', 'Quarter 1', 'overall', 'T4']) assert.equal(termCode(name), null);
});

function fakeDatabase({ termStart = '2026-06-01', termEnd = '2026-09-15', learnerRows = [candidate],
  failPhil = false, screeningRows = [], attendanceSheets = [], attendanceRows = [], failAttendance = false } = {}) {
  const calls = [];
  return { calls, execute: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM SCHOOL_YEAR')) return [[{ school_year_id: 3, starts_on: '2026', ends_on: '2027' }]];
    if (sql.includes('FROM ACADEMIC_TERM WHERE')) return [[
      { term_id: 7, term_name: '1st', starts_at: termStart, ends_at: termEnd },
      { term_id: 8, term_name: '2nd', starts_at: '2026-09-16', ends_at: '2026-12-01' },
      { term_id: 9, term_name: '3rd', starts_at: '2027-01-01', ends_at: '2027-04-01' },
    ]];
    if (sql.includes('FROM STUDENT_SECTION ss')) return [learnerRows];
    if (sql.includes('FROM PHIL_IRI_SCREENING')) {
      if (failPhil) throw new Error('Database unavailable');
      return [screeningRows];
    }
    if (sql.includes('FROM GRADE_SHEET gs')) return [activities()];
    if (sql.includes('FROM SUBJECT_COMPONENT_WEIGHT cw')) return [weights];
    if (sql.includes('FROM ATTENDANCE_SHEET ash') || sql.includes('FROM ATTENDANCE a')) {
      if (failAttendance) throw new Error('Attendance database unavailable');
      return [sql.includes('FROM ATTENDANCE_SHEET ash') ? attendanceSheets : attendanceRows];
    }
    throw new Error('Unexpected SQL');
  } };
}

test('joins exact English offering, source term, year and enrollment, not target grades', async () => {
  const db = fakeDatabase();
  const result = await loadInputs(db, { schoolYear: '2026-2027', term: 'T2' }, new Date('2026-10-05'));
  assert.equal(result.eligible.length, 1);
  const query = db.calls.find(call => call.sql.includes('FROM STUDENT_SECTION ss'));
  assert.deepEqual(query.params, [7, 'T1', 3]);
  assert.match(query.sql, /so\.school_year_id = ss\.school_year_id/);
  assert.match(query.sql, /sg\.student_section_id = ss\.student_section_id/);
  assert.match(query.sql, /OR sg\.student_section_id IS NULL/);
  assert.match(query.sql, /sg\.subject_offering_id = so\.subject_offering_id AND sg\.student_id = ss\.student_id/);
  assert.match(query.sql, /UPPER\(sub\.subject_name\) = 'ENGLISH'/);
});

const screeningPeriod = { schoolYearStart: '2026-06-01', sourceEnd: '2026-09-15', targetStart: '2026-09-16' };
test('owned assignment scope narrows every record read before model inputs are built', async () => {
  const db = fakeDatabase();
  await loadInputs(db, { schoolYear: '2026-2027', term: 'T2' }, new Date('2026-10-05'),
    { schoolYearId: 3, sectionId: 8, subjectOfferingId: 20 });
  const years = db.calls.find(call => call.sql.includes('FROM SCHOOL_YEAR'));
  assert.match(years.sql, /WHERE school_year_id = \?/); assert.deepEqual(years.params, [3]);
  const learners = db.calls.find(call => call.sql.includes('FROM STUDENT_SECTION ss'));
  assert.match(learners.sql, /AND ss\.section_id = \?/);
  assert.match(learners.sql, /AND so\.subject_offering_id = \?/);
  assert.deepEqual(learners.params, [7, 'T1', 3, 8, 20]);
  const readings = db.calls.find(call => call.sql.includes('FROM PHIL_IRI_SCREENING'));
  assert.deepEqual(readings.params, [3, 8]);
  const assessments = db.calls.find(call => call.sql.includes('FROM GRADE_SHEET gs'));
  assert.match(assessments.sql, /AND so\.section_id = \?/);
  assert.deepEqual(assessments.params, [7, 3, 8, 20]);
});

test('invalid internal scope is rejected before any database read', async () => {
  const db = fakeDatabase();
  await assert.rejects(loadInputs(db, { schoolYear: '2026-2027', term: 'T2' }, new Date(), { sectionId: -1 }), /scope is invalid/);
  assert.equal(db.calls.length, 0);
});

const screening = { student_section_id: 501, assessed_on: '2026-06-15', test_taken: 1,
  literal_max: 14, inferential_max: 12, critical_max: 14,
  literal_score: 7, inferential_score: 9, critical_score: 0 };

test('complete screening normalizes against saved maxima and preserves a real zero', () => {
  const result = screeningFeatures(screening, screeningPeriod);
  assert.equal(result.reason, null);
  assert.equal(result.assessedOn, '2026-06-15');
  assert.deepEqual(result.features, { phil_iri_literal_pct: 50, phil_iri_inferential_pct: 75,
    phil_iri_critical_pct: 0, phil_iri_unavailable: 0 });
  const changed = screeningFeatures({ ...screening, literal_max: 20, literal_score: 10 }, screeningPeriod);
  assert.equal(changed.features.phil_iri_literal_pct, 50);
});

test('incomplete, untested, malformed and out-of-period screening never becomes a partial input or zero', () => {
  for (const changes of [
    { literal_score: null }, { inferential_score: '' }, { critical_score: -1 },
    { critical_score: 15 }, { literal_score: 2.5 }, { literal_max: 0 },
    { test_taken: 0 }, { test_taken: null }, { assessed_on: null },
    { assessed_on: '2026-02-30' }, { assessed_on: '2025-06-15' },
    { assessed_on: '2026-09-16' }, { assessed_on: '2027-04-01' },
  ]) {
    const result = screeningFeatures({ ...screening, ...changes }, screeningPeriod);
    assert.ok(result.reason, JSON.stringify(changes));
    assert.deepEqual(result.features, { phil_iri_literal_pct: null, phil_iri_inferential_pct: null,
      phil_iri_critical_pct: null, phil_iri_unavailable: 1 });
  }
  assert.ok(screeningFeatures(screening).reason);
  assert.ok(screeningFeatures(null, screeningPeriod).reason);
});

test('school calendar dates use Manila boundaries rather than the previous UTC day', () => {
  const result = screeningFeatures({ ...screening, assessed_on: '2026-06-01' }, {
    schoolYearStart: new Date('2026-05-31T16:00:00Z'),
    sourceEnd: new Date('2026-09-15T15:59:59Z'), targetStart: new Date('2026-09-15T16:00:00Z'),
  });
  assert.equal(result.features.phil_iri_unavailable, 0);
  assert.ok(screeningFeatures({ ...screening, assessed_on: '2026-05-31' }, {
    ...screeningPeriod, schoolYearStart: new Date('2026-05-31T16:00:00Z'),
  }).reason);
});

test('prediction joins screening by enrollment year without reading oral Post-Test assessments', async () => {
  const db = fakeDatabase({ screeningRows: [screening] });
  const result = await loadInputs(db, { schoolYear: '2026-2027', term: 'T2' }, new Date('2026-10-05'));
  const query = db.calls.find(call => call.sql.includes('FROM PHIL_IRI_SCREENING'));
  assert.deepEqual(query.params, [3]);
  assert.match(query.sql, /ss\.student_section_id = ps\.student_section_id/);
  assert.match(query.sql, /ss\.school_year_id = \?/);
  assert.ok(db.calls.every(call => !call.sql.includes('PHIL_IRI_ASSESSMENT')));
  assert.equal(result.eligible[0].features.phil_iri_literal_pct, 50);
  assert.equal(result.eligible[0].features.phil_iri_critical_pct, 0);
  assert.equal(result.eligible[0].features.phil_iri_unavailable, 0);
  assert.equal(result.eligible[0].profile.screeningAssessmentDate, '2026-06-15');
  assert.equal(Object.keys(result.eligible[0].features).length, 9);
  assert.equal(result.eligible[0].features.absence_rate, null);
});

test('another enrollment, duplicate screening, missing date and later results remain unavailable', async () => {
  for (const screeningRows of [
    [{ ...screening, student_section_id: 999 }], [screening, screening],
    [{ ...screening, assessed_on: null }], [{ ...screening, assessed_on: '2026-12-01' }],
  ]) {
    const result = await loadInputs(fakeDatabase({ screeningRows }), { schoolYear: '2026-2027', term: 'T2' }, new Date('2026-10-05'));
    assert.equal(result.eligible.length, 1);
    assert.equal(result.eligible[0].features.phil_iri_unavailable, 1);
    assert.equal(result.eligible[0].features.phil_iri_literal_pct, null);
    assert.equal(result.eligible[0].profile.screeningStatus, 'unavailable');
  }
});

test('school years accept actual stored year strings and date boundaries, never guessed fallback years', () => {
  assert.equal(schoolYearRange({ starts_on: '2026', ends_on: '2027' }), '2026-2027');
  assert.equal(schoolYearRange({ starts_on: '2026-06-01', ends_on: '2027-04-01' }), '2026-2027');
  assert.equal(schoolYearRange({ starts_on: null, ends_on: '2027' }), null);
});

test('T1, incomplete periods, duplicate sheets and absent own scores are unavailable, never low risk', async () => {
  const first = await loadInputs(fakeDatabase(), { schoolYear: '2026-2027', term: 'T1' });
  assert.equal(first.eligible.length, 0); assert.match(first.unavailable[0].reason, /no previous term/);
  const future = await loadInputs(fakeDatabase({ termEnd: '2027-09-15' }), { schoolYear: '2026-2027', term: 'T2' }, new Date('2026-10-05'));
  assert.equal(future.eligible.length, 0);
  const duplicate = await loadInputs(fakeDatabase({ learnerRows: [candidate, candidate] }), { schoolYear: '2026-2027', term: 'T2' });
  assert.match(duplicate.unavailable[0].reason, /Duplicate/);
  const noOwn = await loadInputs(fakeDatabase({ learnerRows: [{ ...candidate, student_section_id: 999 }] }), { schoolYear: '2026-2027', term: 'T2' });
  assert.equal(noOwn.eligible.length, 0); assert.match(noOwn.unavailable[0].reason, /incomplete/);
});

test('database failure propagates and invalid filters issue no SQL', async () => {
  await assert.rejects(loadInputs(fakeDatabase({ failPhil: true }), { schoolYear: '2026-2027', term: 'T2' }), /Database unavailable/);
  const db = fakeDatabase();
  await assert.rejects(loadInputs(db, { schoolYear: '2026-2027', term: 'overall' }), /target term/);
  await assert.rejects(loadInputs(db, { schoolYear: 'all', term: 'T2' }), /school year/);
  assert.equal(db.calls.length, 0);
});

const sourceAttendance = {
  attendanceSheets: ['2026-09-14', '2026-09-15'].map((date, index) => ({ attendance_sheet_id: index + 1,
    attendance_date: date, section_id: 8, school_year_id: 3, no_class_reason: null })),
  attendanceRows: ['A', 'P'].map((status, index) => ({ attendance_sheet_id: index + 1,
    student_section_id: 501, section_id: 8, school_year_id: 3, status })),
};

test('complete source-term attendance reaches the nine model inputs, not a training default', async () => {
  const db = fakeDatabase({ termStart: '2026-09-14', ...sourceAttendance });
  const result = await loadInputs(db, { schoolYear: '2026-2027', term: 'T2' }, new Date('2026-10-05'));
  assert.equal(result.eligible[0].features.absence_rate, 0.5);
  assert.equal(result.eligible[0].profile.attendanceStatus, 'available');
  assert.equal(result.eligible[0].profile.attendanceSummary.classDays, 2);
  assert.equal(Object.keys(result.eligible[0].features).length, 9);
  const queries = db.calls.filter(call => call.sql.includes('FROM ATTENDANCE'));
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[0].params, [3, '2026-09-14', '2026-09-15', 8]);
});

test('no-class markers change the model denominator without erasing recorded attendance', async () => {
  const rows = sourceAttendance.attendanceSheets.map(row => ({ ...row,
    no_class_reason: row.attendance_date === '2026-09-14' ? 'HOLIDAY' : null }));
  const result = await loadInputs(fakeDatabase({ termStart: '2026-09-14', ...sourceAttendance,
    attendanceSheets: rows }), { schoolYear: '2026-2027', term: 'T2' }, new Date('2026-10-05'));
  assert.equal(result.eligible[0].features.absence_rate, 0);
  assert.equal(result.eligible[0].profile.attendanceSummary.excludedDays, 1);
  assert.equal(sourceAttendance.attendanceRows[0].status, 'A');
});

test('UTC term end crossing Manila midnight never includes the target first day', async () => {
  const db = fakeDatabase({ termStart: new Date('2026-09-14T00:00:00Z'),
    termEnd: new Date('2026-09-15T23:59:00Z'), ...sourceAttendance });
  const result = await loadInputs(db, { schoolYear: '2026-2027', term: 'T2' }, new Date('2026-10-05'));
  assert.equal(result.eligible[0].features.absence_rate, 0.5);
  assert.equal(result.eligible[0].profile.attendanceSummary.sourceEnd, '2026-09-15');
  const query = db.calls.find(call => call.sql.includes('FROM ATTENDANCE_SHEET ash'));
  assert.deepEqual(query.params, [3, '2026-09-14', '2026-09-15', 8]);
});

test('incomplete attendance stays null; read failure propagates; T1 never reads attendance', async () => {
  const incomplete = await loadInputs(fakeDatabase({ termStart: '2026-09-14', ...sourceAttendance,
    attendanceRows: sourceAttendance.attendanceRows.slice(1) }), { schoolYear: '2026-2027', term: 'T2' }, new Date('2026-10-05'));
  assert.equal(incomplete.eligible[0].features.absence_rate, null);
  assert.equal(incomplete.eligible[0].profile.attendanceSummary.missingDays, 1);
  await assert.rejects(loadInputs(fakeDatabase({ failAttendance: true }),
    { schoolYear: '2026-2027', term: 'T2' }, new Date('2026-10-05')), /Attendance database unavailable/);
  const db = fakeDatabase();
  await loadInputs(db, { schoolYear: '2026-2027', term: 'T1' });
  assert.ok(db.calls.every(call => !call.sql.includes('FROM ATTENDANCE')));
});
