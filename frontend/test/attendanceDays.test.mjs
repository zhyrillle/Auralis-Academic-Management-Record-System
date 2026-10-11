import test from 'node:test';
import assert from 'node:assert/strict';
import { noClassDaysFromSheets, classDaysForMonth } from '../src/utils/attendanceDays.js';

test('blank/unmarked dates stay class-day candidates; only explicit markers exclude dates', () => {
  const sheets = [
    { attendance_date: '2026-10-12T00:00:00.000Z', no_class_reason: 'HOLIDAY' },
    { attendance_date: '2026-10-12', no_class_reason: null },
    { attendance_date: '2026-10-13', no_class_reason: 'SUSPENSION' },
    { attendance_date: '2026-10-14', no_class_reason: null },
  ];
  const days = noClassDaysFromSheets(sheets);
  assert.deepEqual(days, { '2026-10-12': 'HOLIDAY', '2026-10-13': 'SUSPENSION' });
  const weekdays = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'].map(dateStr => ({ dateStr }));
  assert.deepEqual(classDaysForMonth(weekdays, days).map(day => day.dateStr), ['2026-10-14', '2026-10-15']);
  delete days['2026-10-12'];
  assert.equal(classDaysForMonth(weekdays, days).length, 3);
});
