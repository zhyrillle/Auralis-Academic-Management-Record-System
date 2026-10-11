const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const summary = require('../services/AttendanceSummaryService');

function harness({ marked = null, date = '2026-10-12', owner = 9, count = 3 } = {}) {
  const state = { reasons: [marked, null], records: count, calls: [], committed: false, rolledBack: false, released: false };
  let original;
  const connection = {
    beginTransaction: async () => { original = [...state.reasons]; },
    commit: async () => { state.committed = true; },
    rollback: async () => { state.reasons = original; state.rolledBack = true; },
    release: () => { state.released = true; },
    execute: async (sql, params) => {
      state.calls.push({ sql, params: Array.from(params || []) });
      if (sql.includes('AS adviser_section_id')) return [[{
        attendance_sheet_id: 11, attendance_scope: 'SECTION', attendance_date: date,
        adviser_section_id: 7, adviser_year_id: 3, adviser_user_id: owner,
      }]];
      if (sql.includes('FROM SECTION WHERE')) return [[{ section_id: 7 }]];
      if (sql.includes('ORDER BY ash.attendance_sheet_id FOR UPDATE')) return [state.reasons.map((reason, index) => ({ attendance_sheet_id: 11 + index, no_class_reason: reason }))];
      if (sql.includes('COUNT(*) AS record_count')) return [[{ record_count: state.records }]];
      if (sql.includes('UPDATE ATTENDANCE_SHEET')) { state.reasons = state.reasons.map(() => params[0]); return [{ affectedRows: 2 }]; }
      throw new Error('Unexpected query in day-marker test.');
    },
  };
  const database = { getConnection: async () => connection };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/AttendanceDayService.js'), 'utf8'), {
    module, Intl, Date, require: name => {
      if (name === '../config/db') return database;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { state, service: module.exports, database };
}
const now = new Date('2026-10-12T02:00:00Z');

test('marking and unmarking preserve learner records and update every sheet for the same section-year-date', async () => {
  const { state, service, database } = harness();
  const request = { sheetId: 11, reason: 'HOLIDAY', userId: 9, confirmExistingRecords: true };
  const result = await service.setNoClasses(request, database, now);
  assert.deepEqual(state.reasons, ['HOLIDAY', 'HOLIDAY']);
  assert.equal(result.retainedRecordCount, 3);
  assert.equal(state.records, 3);
  const scopedRead = state.calls.find(call => call.sql.includes('ORDER BY ash.attendance_sheet_id FOR UPDATE'));
  assert.deepEqual(scopedRead.params, [7, 3, '2026-10-12']);
  await service.setNoClasses({ ...request, reason: null }, database, now);
  assert.deepEqual(state.reasons, [null, null]);
  assert.equal(state.records, 3);
  assert.ok(state.calls.every(call => !/DELETE|UPDATE ATTENDANCE SET/.test(call.sql)));
  assert.ok(state.committed && state.released);
});

test('existing entries require explicit confirmation before a no-class marker is saved', async () => {
  const { service, database, state } = harness();
  await assert.rejects(service.setNoClasses({ sheetId: 11, reason: 'SUSPENSION', userId: 9 }, database, now), failure => failure.code === 'DAY_MARKER_CONFIRMATION_REQUIRED');
  assert.deepEqual(state.reasons, [null, null]);
  assert.ok(state.rolledBack && state.released);
});

test('other advisers and past/future dates cannot change a marker', async () => {
  for (const options of [{ owner: 88 }, { date: '2026-10-11' }, { date: '2026-10-13' }]) {
    const { service, database, state } = harness(options);
    await assert.rejects(service.setNoClasses({ sheetId: 11, reason: 'HOLIDAY', userId: 9, confirmExistingRecords: true }, database, now), failure =>
      failure.code === (options.owner ? 'DAY_MARKER_FORBIDDEN' : 'ATTENDANCE_DATE_LOCKED'));
    assert.ok(state.rolledBack);
    assert.deepEqual(state.reasons, [null, null]);
  }
});

test('a marker on any daily sheet blocks attendance writes across that section’s day', async () => {
  const { service, database, state } = harness({ marked: 'HOLIDAY' });
  let wrote = false;
  await assert.rejects(service.withWritableSheet(12, () => { wrote = true; }, database), failure => failure.code === 'NO_CLASSES_DAY');
  assert.equal(wrote, false);
  assert.ok(state.rolledBack && state.released);
});

test('an unmarked day allows normal attendance writes', async () => {
  const { service, database, state } = harness();
  assert.equal(await service.withWritableSheet(11, async () => 'saved', database), 'saved');
  assert.ok(state.committed && state.released);
});

test('invalid reasons are rejected without opening a transaction', async () => {
  const { service, database, state } = harness();
  await assert.rejects(service.setNoClasses({ sheetId: 11, reason: 'P', userId: 9 }, database, now), failure => failure.code === 'INVALID_DAY_REASON');
  assert.equal(state.calls.length, 0);
});

test('Manila date restrictions handle the UTC midnight boundary', () => {
  const { service } = harness();
  assert.equal(service.todayInManila(new Date('2026-10-11T16:01:00Z')), '2026-10-12');
});

test('monthly exclusions count a date once and ignore weekends and other years', () => {
  const sheets = [
    { attendance_date: '2026-06-12', no_class_reason: 'HOLIDAY' },
    { attendance_date: '2026-06-12', no_class_reason: 'HOLIDAY' },
    { attendance_date: '2026-06-13', no_class_reason: 'HOLIDAY' },
    { attendance_date: '2025-06-12', no_class_reason: 'HOLIDAY' },
    { attendance_date: '2027-01-04', no_class_reason: 'SUSPENSION' },
    { attendance_date: '2027-01-05', no_class_reason: null },
  ];
  const counts = summary.monthlyNoClassCounts(sheets, '2026-06-01', '2027-04-30');
  assert.equal(counts[0], 1);
  assert.equal(counts[7], 1);
  assert.equal(counts.reduce((sum, count) => sum + count, 0), 2);
});
