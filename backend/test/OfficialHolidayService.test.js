const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getOfficialHolidaysForYear,
  getOfficialHolidaysMap,
  isOfficialHoliday,
} = require('../services/OfficialHolidayService');

test('computes official Philippine holidays for any year correctly', () => {
  const holidays2026 = getOfficialHolidaysForYear(2026);
  assert.ok(holidays2026.length >= 18);

  // Check key regular holidays
  assert.ok(holidays2026.some(h => h.date === '2026-01-01' && h.name === "New Year's Day" && h.type === 'REGULAR'));
  assert.ok(holidays2026.some(h => h.date === '2026-04-09' && h.name.includes('Araw ng Kagitingan')));
  assert.ok(holidays2026.some(h => h.date === '2026-05-01' && h.name === 'Labor Day'));
  assert.ok(holidays2026.some(h => h.date === '2026-06-12' && h.name === 'Independence Day'));
  assert.ok(holidays2026.some(h => h.date === '2026-08-31' && h.name === 'National Heroes Day'));
  assert.ok(holidays2026.some(h => h.date === '2026-11-30' && h.name === 'Bonifacio Day'));
  assert.ok(holidays2026.some(h => h.date === '2026-12-25' && h.name === 'Christmas Day'));
  assert.ok(holidays2026.some(h => h.date === '2026-12-30' && h.name === 'Rizal Day'));

  // Check Holy Week dates (Easter 2026 is April 5)
  assert.ok(holidays2026.some(h => h.date === '2026-04-02' && h.name === 'Maundy Thursday'));
  assert.ok(holidays2026.some(h => h.date === '2026-04-03' && h.name === 'Good Friday'));
  assert.ok(holidays2026.some(h => h.date === '2026-04-04' && h.name === 'Black Saturday'));

  // Check special non-working days
  assert.ok(holidays2026.some(h => h.date === '2026-08-21' && h.name === 'Ninoy Aquino Day'));
  assert.ok(holidays2026.some(h => h.date === '2026-11-01' && h.name === "All Saints' Day"));
  assert.ok(holidays2026.some(h => h.date === '2026-11-02' && h.name === "All Souls' Day"));
  assert.ok(holidays2026.some(h => h.date === '2026-12-08' && h.name === 'Feast of the Immaculate Conception'));
});

test('isOfficialHoliday identifies holiday dates and non-holidays', () => {
  const bonifacio = isOfficialHoliday('2026-11-30');
  assert.ok(bonifacio);
  assert.equal(bonifacio.name, 'Bonifacio Day');

  const regularDay = isOfficialHoliday('2026-11-19');
  assert.equal(regularDay, null);
});

test('getOfficialHolidaysMap spans multiple years', () => {
  const map = getOfficialHolidaysMap(2025, 2027);
  assert.ok(map.has('2025-12-25'));
  assert.ok(map.has('2026-12-25'));
  assert.ok(map.has('2027-12-25'));
});
