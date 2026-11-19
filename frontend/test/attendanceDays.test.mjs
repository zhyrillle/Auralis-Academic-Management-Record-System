import test from 'node:test';
import assert from 'node:assert/strict';
import { noClassDaysFromSheets, classDaysForMonth, getOfficialHolidays, getHolidayInfo, isOfficialHoliday } from '../src/utils/attendanceDays.js';

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

test('automatic official holidays are computed and excluded based on calendar', () => {
  const holidays2026 = getOfficialHolidays(2026);
  assert.ok(holidays2026.length >= 18);
  assert.ok(holidays2026.some(h => h.date === '2026-06-12' && h.name === 'Independence Day'));
  assert.ok(holidays2026.some(h => h.date === '2026-11-30' && h.name === 'Bonifacio Day'));
  assert.ok(holidays2026.some(h => h.date === '2026-12-25' && h.name === 'Christmas Day'));
  assert.ok(holidays2026.some(h => h.date === '2026-12-30' && h.name === 'Rizal Day'));

  assert.equal(isOfficialHoliday('2026-11-30'), true);
  assert.equal(getHolidayInfo('2026-11-30')?.name, 'Bonifacio Day');
  assert.equal(isOfficialHoliday('2026-11-19'), false);

  const daysWithCalendar = noClassDaysFromSheets([], 2026);
  assert.equal(daysWithCalendar['2026-11-30'], 'HOLIDAY');
  assert.equal(daysWithCalendar['2026-12-25'], 'HOLIDAY');

  const novWeekdays = [
    { dateStr: '2026-11-26' },
    { dateStr: '2026-11-27' },
    { dateStr: '2026-11-30' },
  ];
  const activeClassDays = classDaysForMonth(novWeekdays, daysWithCalendar);
  assert.deepEqual(activeClassDays.map(d => d.dateStr), ['2026-11-26', '2026-11-27']);
});
