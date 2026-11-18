const { test } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../services/AttendanceMonitoringService');
const { tierForOccurrences } = require('../services/AttendanceInterventionPolicy');

const terms = [
  { value: 'T1', startsOn: '2026-01-26', endsOn: '2026-01-30' },
  { value: 'T2', startsOn: '2026-02-02', endsOn: '2026-02-06' },
  { value: 'T3', startsOn: '2026-02-16', endsOn: '2026-06-30' },
];
const dates = service.scheduledDays(terms);
const learner = { id: '501', studentId: 41, sectionId: 7, name: 'Fixture Learner' };
const records = (statuses, days = dates) => [...statuses].flatMap((status, i) => status === '-' ? [] : [{ date: days[i], status }]);
const summarize = statuses => service.summarizeLearner(learner, dates, new Set(), records(statuses), dates[statuses.length - 1]);

test('progressive matrix covers all boundaries and leaves tier 6 open at 11+', () => {
  for (const [count, expected] of [[0, null], [1, 1], [3, 1], [4, 2], [5, 3], [6, 4], [7, 4], [8, 5], [10, 5], [11, 6], [15, 6], [16, 6], [40, 6]]) {
    assert.equal(tierForOccurrences(count), expected, `${count} occurrences`);
  }
  for (const invalid of [-1, 1.5, NaN, Infinity, null, '4']) assert.throws(() => tierForOccurrences(invalid), TypeError);
});

test('calendar excludes weekends and term breaks and counts a shared term boundary only once', () => {
  assert.ok(!dates.includes('2026-01-31'));
  assert.ok(!dates.includes('2026-02-09'));
  const handoff = service.scheduledDays(terms.map((term, i) => i === 1 ? { ...term, startsOn: '2026-01-30' } : term));
  assert.equal(handoff.filter(date => date === '2026-01-30').length, 1);
  for (const invalid of [[], terms.slice(1), [terms[0], terms[0], terms[2]],
    terms.map((term, i) => i === 1 ? { ...term, startsOn: '2026-01-29' } : term),
    terms.map((term, i) => i === 1 ? { ...term, endsOn: '2026-02-30' } : term)]) {
    assert.throws(() => service.scheduledDays(invalid), error => error.status === 409);
  }
});

test('tiers use accumulated absences across separated dates rather than consecutive streaks', () => {
  for (const [count, tier] of [[1, 1], [3, 1], [4, 2], [5, 3], [6, 4], [7, 4], [8, 5], [10, 5], [11, 6], [16, 6], [30, 6]]) {
    const result = summarize('AP'.repeat(count));
    assert.equal(result.occurrences, count);
    assert.equal(result.interventionTier, tier);
    assert.equal(result.longestStreak, 1, 'streak remains developer-only diagnostic information');
  }
});

test('late marks stay separate at all counts and never convert into occurrences', () => {
  for (const count of [1, 2, 3, 5, 6, 12]) {
    const result = summarize('L'.repeat(count));
    assert.equal(result.late, count);
    assert.equal(result.absent, 0);
    assert.equal(result.occurrences, 0);
    assert.equal(result.interventionTier, null);
    assert.equal(result.level, 'none');
  }
  const mixed = summarize('APAPAPLLLLLL');
  assert.equal(mixed.occurrences, 3);
  assert.equal(mixed.interventionTier, 1);
  assert.equal(mixed.late, 6);
});

test('monthly occurrences and exact absence/late dates use saved marks without carrying conversions', () => {
  const result = summarize('PPPALLL');
  assert.equal(result.occurrences, 1);
  assert.equal(result.monthly[0].occurrences, 1);
  assert.equal(result.monthly[1].occurrences, 0);
  assert.equal(result.monthly[0].late, 1);
  assert.equal(result.monthly[1].late, 2);
  assert.deepEqual(result.monthly[0].absenceDates, [dates[3]]);
  assert.deepEqual(result.monthly[0].lateDates, [dates[4]]);
  assert.deepEqual(result.monthly[1].lateDates, dates.slice(5, 7));
  const nextYear = service.summarizeLearner(learner, ['2027-01-04'], new Set(), [{ date: '2027-01-04', status: 'L' }], '2027-01-04');
  assert.equal(nextYear.late, 1);
  assert.equal(nextYear.occurrences, 0);
});

test('saved no-class dates, weekends and future marks do not add occurrences', () => {
  const excluded = new Set([dates[4]]);
  const result = service.summarizeLearner(learner, dates, excluded,
    records('AAAAAAA').concat({ date: dates[7], status: 'A' }, { date: '2026-01-31', status: 'A' }), dates[6]);
  assert.equal(result.absent, 6);
  assert.equal(result.occurrences, 6);
  assert.deepEqual(result.incidents[0].dates, dates.slice(0, 7).filter(date => !excluded.has(date)));
});

test('blanks, invalid or conflicting marks are excluded and identical duplicates count once', () => {
  const marks = records('AA-AA').concat({ date: dates[0], status: 'A' }, { date: dates[1], status: 'P' });
  const result = service.summarizeLearner(learner, dates, new Set(), marks, dates[4]);
  assert.equal(result.occurrences, 3);
  assert.deepEqual(result.missingDates, [dates[2]]);
  assert.deepEqual(result.conflictingDates, [dates[1]]);
  assert.equal(result.incomplete, true, 'diagnostics are retained in the service for developer auditing');
  assert.equal(result.level, 'tier1', 'incomplete is never a user-facing level');
});

test('no annual percentage or absence conversion is calculated', () => {
  const result = summarize('AAAAALLLLLL');
  for (const key of ['annualPercentage', 'overLimit', 'absenceEquivalents', 'convertedAbsences', 'lateRemainder']) {
    assert.ok(!Object.hasOwn(result, key), key);
    assert.ok(result.monthly.every(month => !Object.hasOwn(month, key)), key);
  }
  assert.equal(result.occurrences, 5);
  assert.equal(result.interventionTier, 3);
});

test('future years and calendars with no applicable days avoid assigning a tier', () => {
  const future = service.summarizeLearner(learner, dates, new Set(), [], '2025-12-31');
  assert.equal(future.level, 'upcoming');
  assert.equal(future.interventionTier, null);
  const excluded = service.summarizeLearner(learner, dates, new Set(dates), [], dates.at(-1));
  assert.equal(excluded.level, 'unavailable');
  assert.equal(excluded.interventionTier, null);
});

function databaseFixture() {
  const state = { status: 'A', duplicateEnrollment: false };
  const calls = [];
  const database = { execute: async (sql, params) => {
    assert.match(sql, /^\s*SELECT/); calls.push({ sql, params });
    if (sql.includes('FROM SCHOOL_YEAR')) return [[{ school_year_id: 3, starts_on: 2026, ends_on: 2027, status: 'ONGOING' }]];
    if (sql.includes('FROM ACADEMIC_TERM')) return [terms.map((row, i) => ({ ...row, term_id: i + 1, term_name: `Term ${i + 1}`, school_year_id: 3 }))];
    if (sql.includes('SELECT DISTINCT so.school_year_id')) return [[]];
    if (sql.includes('FROM STUDENT_SECTION ss JOIN STUDENT st')) {
      const roster = { student_section_id: 501, student_id: 41, section_id: 7, section_name: 'Fixture', grade_level_name: 'Grade 8', name: 'Fixture Learner' };
      return [[roster, ...(state.duplicateEnrollment ? [{ ...roster, student_section_id: 502 }] : [])]];
    }
    assert.deepEqual(params, [3]);
    assert.match(sql, /attendance_scope = 'SECTION'/);
    assert.ok(!sql.includes('is_active'), 'historical adviser assignments remain included');
    if (sql.includes('FROM ATTENDANCE_SHEET ash')) return [[{ section_id: 7, date: dates[1], no_class_reason: 'HOLIDAY' }]];
    if (sql.includes('FROM ATTENDANCE a')) {
      return [(state.marks || [{ date: dates[0], status: state.status }])
        .map(mark => ({ student_section_id: 501, section_id: 7, ...mark }))];
    }
    throw new Error(`Unexpected query: ${sql}`);
  } };
  return { database, state, calls };
}

test('batch reads are year/SECTION scoped, respect exclusions and Manila midnight, and show corrections on reread', async () => {
  const f = databaseFixture();
  const now = new Date('2026-01-26T16:30:00Z'); // Jan 27 in Manila
  const first = await service.preview(f.database, { schoolYear: '3' }, now);
  assert.equal(first.context.asOf, '2026-01-27');
  assert.ok(!Object.hasOwn(first, 'diagnostics'));
  assert.equal(first.students[0].longestStreak, 1);
  for (const key of ['incomplete', 'missingDates', 'conflictingDates', 'reviewReason', 'expectedDays', 'recordedDays', 'incidents', 'annualPercentage', 'absenceEquivalents']) {
    assert.ok(!Object.hasOwn(first.students[0], key), `private field ${key}`);
    assert.ok(first.students[0].monthly.every(month => !Object.hasOwn(month, key)), key);
  }
  const audit = await service.preview(f.database, { schoolYear: '3' }, now, { includeDiagnostics: true });
  assert.equal(audit.diagnostics[0].expectedDays, 1);
  assert.ok(!Object.hasOwn(await service.preview(f.database, { schoolYear: '3', includeDiagnostics: 'true' }, now), 'diagnostics'));
  assert.equal(first.policy.occurrenceBasis, 'absent');
  assert.equal(first.policy.tiers[5].range, '11+ occurrences');
  assert.ok(!Object.hasOwn(first.summary, 'excessive'));
  assert.ok(!Object.hasOwn(first.policy, 'annualLimit'));
  assert.equal(first.students[0].absent, 1);
  assert.equal(first.students[0].occurrences, 1);
  assert.equal(first.students[0].interventionTier, 1);
  assert.equal(first.policy.tiers.length, 6);
  assert.match(first.policy.disclaimer, /not constitute an automatic or mechanical basis/);
  assert.equal(first.summary.tiers[1], 1);
  f.state.status = 'P';
  const corrected = await service.preview(f.database, { schoolYear: '3' }, now);
  assert.equal(corrected.students[0].absent, 0);
  assert.equal(corrected.students[0].present, 1);
  assert.equal(corrected.students[0].interventionTier, null);
  assert.equal(corrected.students[0].longestStreak, 0);
  f.state.duplicateEnrollment = true;
  const ambiguous = await service.preview(f.database, { schoolYear: '3' }, now);
  assert.equal(ambiguous.students.length, 1);
  assert.equal(ambiguous.students[0].level, 'unavailable');
  assert.equal(ambiguous.students[0].absent, 0);
  assert.equal(ambiguous.students[0].interventionTier, null);
  assert.ok(!Object.hasOwn(ambiguous.students[0], 'reviewReason'));
  const ambiguousAudit = await service.preview(f.database, { schoolYear: '3' }, now, { includeDiagnostics: true });
  assert.match(ambiguousAudit.diagnostics[0].reviewReason, /Multiple section/);
  await assert.rejects(service.preview(f.database, { schoolYear: '999' }, now), error => error.status === 400);
});

test('weekly tardiness counts unique class days, skips exclusions and defaults to the last completed week', async () => {
  const { database, state } = databaseFixture();
  state.marks = [
    ...['2026-01-26', '2026-01-26', '2026-01-27', '2026-01-30', '2026-01-31', '2026-02-04', '2026-02-09']
      .map(date => ({ date, status: 'L' })),
    { date: '2026-01-28', status: 'A' },
    { date: '2026-01-30', status: 'P' },
    { date: '2026-02-03', status: 'P' },
  ];
  const now = new Date('2026-02-02T18:00:00Z'); // Feb 3 in Manila
  const data = await service.weekly(database, { schoolYear: '3' }, now);
  assert.equal(data.defaultWeek, '2026-01-26');
  assert.deepEqual(data.weeks, [
    { startsOn: '2026-02-02', endsOn: '2026-02-06', through: '2026-02-03', isCurrent: true },
    { startsOn: '2026-01-26', endsOn: '2026-01-30', through: '2026-01-30', isCurrent: false },
  ]);
  assert.deepEqual(data.students[0].attendanceByWeek, {
    '2026-01-26': { absenceDates: ['2026-01-28'], lateDates: ['2026-01-26'] },
    '2026-02-02': { absenceDates: [], lateDates: [] },
  });
  const onBreak = await service.weekly(database, { schoolYear: '3' }, new Date('2026-02-12T00:00:00Z'));
  assert.equal(onBreak.defaultWeek, '2026-02-02');
  assert.ok(!onBreak.weeks.some(week => week.isCurrent));
  state.marks = [{ date: '2026-02-02', status: 'L' }, { date: '2026-02-02', status: 'A' }];
  const unresolved = await service.weekly(database, { schoolYear: '3' }, now);
  assert.deepEqual(unresolved.students[0].attendanceByWeek, { '2026-02-02': null });
});

test('attendance endpoints enforce active Principal access before reading school records', async () => {
  const express = require('express'), User = require('../models/User'), db = require('../config/db');
  const originalFind = User.findById, originalExecute = db.execute;
  let server;
  try {
    User.findById = async id => ({ user_id: id, role: id === 1 ? 'Principal' : 'Adviser', account_status: id === 3 ? 'Inactive' : 'Active' });
    db.execute = databaseFixture().database.execute;
    const app = express(); app.use('/attendance', require('../routes/attendanceMonitoringRoutes'));
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}/attendance/options`;
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { headers: { 'X-Auralis-User-Id': '2' } })).status, 403);
    assert.equal((await fetch(base, { headers: { 'X-Auralis-User-Id': '3' } })).status, 401);
    const response = await fetch(base, { headers: { 'X-Auralis-User-Id': '1' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).version, service.VERSION);
    const preview = await fetch(base.replace('/options', '/preview?schoolYear=3&includeDiagnostics=true'), { headers: { 'X-Auralis-User-Id': '1' } });
    assert.equal(preview.status, 200);
    const data = await preview.json();
    assert.ok(!Object.hasOwn(data, 'diagnostics'), 'HTTP parameters cannot enable developer data');
    assert.ok(!Object.hasOwn(data.students[0], 'incomplete'));
    const weeklyUrl = base.replace('/options', '/weekly?schoolYear=3');
    assert.equal((await fetch(weeklyUrl, { headers: { 'X-Auralis-User-Id': '2' } })).status, 403);
    const weekly = await fetch(weeklyUrl, { headers: { 'X-Auralis-User-Id': '1' } });
    assert.equal(weekly.status, 200);
    assert.equal(weekly.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await weekly.json()).students[0].attendanceByWeek, {
      '2026-01-26': { absenceDates: ['2026-01-26'], lateDates: [] },
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    User.findById = originalFind; db.execute = originalExecute;
  }
});
