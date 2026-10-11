const test = require('node:test');
const assert = require('node:assert/strict');
const { attendanceFeatures, loadAttendanceInputs, sourceWeekdays } = require('../services/AttendanceRiskFeatures');

const learner = { studentSectionId: 501, sectionId: 8, schoolYearId: 3 };
const period = { sourceStart: '2026-06-01', sourceEnd: '2026-06-05', targetStart: '2026-06-08' };
const dates = sourceWeekdays(period);
const sheets = () => dates.map((date, index) => ({ attendance_sheet_id: index + 1,
  attendance_date: date, section_id: 8, school_year_id: 3, no_class_reason: null }));
const records = (statuses = ['P', 'A', 'L', 'L', 'L']) => statuses.map((status, index) => ({
  attendance_id: index + 1, attendance_sheet_id: index + 1, student_section_id: 501,
  section_id: 8, school_year_id: 3, status }));

test('uses recorded A / source-term class days; late attendance is not converted to absences', () => {
  const result = attendanceFeatures(learner, sheets(), records(), period);
  assert.equal(result.absenceRate, 0.2);
  assert.equal(result.status, 'available');
  assert.equal(result.summary.classDays, 5);
  assert.equal(result.summary.recordedDays, 5);
  assert.equal(result.summary.absentDays, 1);
  assert.equal(result.summary.lateDays, 3);
  assert.equal(result.summary.missingDays, 0);
});

test('preserves genuine zero and all-absent rate of one, never confuses missing with zero', () => {
  assert.equal(attendanceFeatures(learner, sheets(), records(['P', 'P', 'P', 'P', 'P']), period).absenceRate, 0);
  assert.equal(attendanceFeatures(learner, sheets(), records(['A', 'A', 'A', 'A', 'A']), period).absenceRate, 1);
  const missing = attendanceFeatures(learner, sheets(), [], period);
  assert.equal(missing.absenceRate, null);
  assert.equal(missing.summary.missingDays, 5);
});

test('excludes holiday/suspension once per date even when records and duplicate unmarked sheets remain', () => {
  const rows = sheets();
  rows[1].no_class_reason = 'HOLIDAY';
  rows[3].no_class_reason = 'SUSPENSION';
  rows.push({ ...rows[1], attendance_sheet_id: 99, no_class_reason: null });
  const attendance = records();
  attendance.push({ ...attendance[1], attendance_sheet_id: 99, status: 'P' });
  const result = attendanceFeatures(learner, rows, attendance, period);
  assert.equal(result.absenceRate, 0);
  assert.equal(result.summary.classDays, 3);
  assert.equal(result.summary.excludedDays, 2);
  assert.equal(attendance[1].status, 'A'); // Input records are not mutated or erased.
});

test('missing sheet, learner entry, blank or invalid mark cannot produce a partial rate', () => {
  const noSheet = attendanceFeatures(learner, sheets().slice(1), records(), period);
  assert.equal(noSheet.absenceRate, null);
  assert.equal(noSheet.summary.missingDays, 1);
  const noLearner = attendanceFeatures(learner, sheets(), records().slice(1), period);
  assert.equal(noLearner.absenceRate, null);
  for (const status of [null, '', 'H', 'E', 'h', 'INVALID']) {
    const attendance = records(); attendance[0].status = status;
    assert.equal(attendanceFeatures(learner, sheets(), attendance, period).absenceRate, null);
  }
});

test('same-day duplicates are counted once only when their statuses agree', () => {
  const rows = sheets(), attendance = records();
  rows.push({ ...rows[0], attendance_sheet_id: 99 });
  attendance.push({ ...attendance[0], attendance_sheet_id: 99 });
  assert.equal(attendanceFeatures(learner, rows, attendance, period).absenceRate, 0.2);
  attendance.at(-1).status = 'A';
  const result = attendanceFeatures(learner, rows, attendance, period);
  assert.equal(result.absenceRate, null);
  assert.match(result.reason, /Conflicting/);
});

test('does not borrow attendance from another enrollment, section, year or future term', () => {
  for (const changes of [{ student_section_id: 999 }, { section_id: 9 }, { school_year_id: 2 }]) {
    const attendance = records(); attendance[0] = { ...attendance[0], ...changes };
    assert.equal(attendanceFeatures(learner, sheets(), attendance, period).absenceRate, null);
  }
  const rows = sheets().slice(1);
  rows.push({ ...sheets()[0], attendance_date: '2026-06-08' });
  assert.equal(attendanceFeatures(learner, rows, records(), period).absenceRate, null);
  assert.equal(attendanceFeatures(learner, sheets().map(row => ({ ...row, school_year_id: 2 })), records(), period).absenceRate, null);
});

test('unknown markers, invalid dates, weekend lessons and zero class days fail safely', () => {
  const rows = sheets(); rows[0].no_class_reason = 'UNKNOWN';
  assert.equal(attendanceFeatures(learner, rows, records(), period).absenceRate, null);
  rows[0].no_class_reason = null; rows[0].attendance_date = '2026-02-30';
  assert.equal(attendanceFeatures(learner, rows, records(), period).absenceRate, null);
  assert.equal(attendanceFeatures(learner, sheets().map(row => ({ ...row, no_class_reason: 'HOLIDAY' })), records(), period).absenceRate, null);
  const longer = { ...period, sourceEnd: '2026-06-07' };
  const weekend = { ...sheets()[0], attendance_sheet_id: 99, attendance_date: '2026-06-06' };
  const result = attendanceFeatures(learner, [...sheets(), weekend], [...records(), { ...records()[0], attendance_sheet_id: 99 }], longer);
  assert.equal(result.absenceRate, null);
  assert.match(result.reason, /Weekend/);
});

test('inclusive source dates use weekdays only, reject overlap and malformed periods', () => {
  assert.deepEqual(dates, ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']);
  assert.deepEqual(sourceWeekdays({ ...period, sourceEnd: '2026-06-07' }), dates);
  for (const changes of [{ sourceStart: null }, { sourceStart: '2026-02-30' },
    { sourceStart: '2026-06-06' }, { targetStart: '2026-06-05' }, { sourceStart: '2020-01-01' }]) {
    assert.equal(sourceWeekdays({ ...period, ...changes }), null);
  }
});

test('batch uses two read queries scoped to section/year/dates and exact learner enrollment', async () => {
  const calls = [], db = { execute: async (sql, params) => {
    calls.push({ sql, params }); return [sql.includes('FROM ATTENDANCE_SHEET ash') ? sheets() : records()];
  } };
  const result = await loadAttendanceInputs(db, [learner, { ...learner, studentSectionId: 999 }], period);
  assert.equal(result.get('501').absenceRate, 0.2);
  assert.equal(result.get('999').absenceRate, null);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.deepEqual(call.params, [3, '2026-06-01', '2026-06-05', 8]);
    assert.match(call.sql, /attendance_scope = 'SECTION'/);
    assert.match(call.sql, /attendance_date BETWEEN \? AND \?/);
    assert.doesNotMatch(call.sql, /INSERT|UPDATE|DELETE/);
  }
  assert.match(calls[1].sql, /ss\.student_section_id = a\.student_section_id/);
  assert.match(calls[1].sql, /ss\.section_id = saa\.section_id AND ss\.school_year_id = saa\.school_year_id/);
});

test('database failures propagate, never become a training fallback or empty success', async () => {
  const db = { execute: async () => { throw new Error('Attendance database unavailable'); } };
  await assert.rejects(loadAttendanceInputs(db, [learner], period), /database unavailable/);
  assert.equal((await loadAttendanceInputs(db, [], period)).size, 0);
  const invalid = await loadAttendanceInputs(db, [learner], { ...period, sourceStart: null });
  assert.equal(invalid.get('501').absenceRate, null);
});
