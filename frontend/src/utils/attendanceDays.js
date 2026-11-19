export const NO_CLASS_LABELS = { HOLIDAY: 'Holiday', SUSPENSION: 'Classes suspended' };

// Islamic movable holidays mapping for calendar years
const ISLAMIC_HOLIDAYS = {
  2024: [
    { date: '2024-04-10', name: "Eid'l Fitr", type: 'REGULAR' },
    { date: '2024-06-17', name: "Eid'l Adha", type: 'REGULAR' },
  ],
  2025: [
    { date: '2025-03-31', name: "Eid'l Fitr", type: 'REGULAR' },
    { date: '2025-06-06', name: "Eid'l Adha", type: 'REGULAR' },
  ],
  2026: [
    { date: '2026-03-20', name: "Eid'l Fitr", type: 'REGULAR' },
    { date: '2026-05-27', name: "Eid'l Adha", type: 'REGULAR' },
  ],
  2027: [
    { date: '2027-03-10', name: "Eid'l Fitr", type: 'REGULAR' },
    { date: '2027-05-16', name: "Eid'l Adha", type: 'REGULAR' },
  ],
  2028: [
    { date: '2028-02-27', name: "Eid'l Fitr", type: 'REGULAR' },
    { date: '2028-05-05', name: "Eid'l Adha", type: 'REGULAR' },
  ],
};

function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  const res = new Date(date);
  res.setUTCDate(res.getUTCDate() + days);
  return res;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function getLastMondayOfAugust(year) {
  const d = new Date(Date.UTC(year, 7, 31));
  const dow = d.getUTCDay();
  const diff = dow >= 1 ? dow - 1 : 6;
  d.setUTCDate(31 - diff);
  return d;
}

/**
 * Returns all official Philippine holidays for a calendar year based on national calendar rules.
 */
export function getOfficialHolidays(year) {
  const y = Number(year);
  if (!y || isNaN(y)) return [];

  const holidays = [
    { date: `${y}-01-01`, name: "New Year's Day", type: 'REGULAR' },
    { date: `${y}-02-25`, name: 'EDSA People Power Revolution Anniversary', type: 'SPECIAL_NON_WORKING' },
    { date: `${y}-04-09`, name: 'Araw ng Kagitingan (Day of Valor)', type: 'REGULAR' },
    { date: `${y}-05-01`, name: 'Labor Day', type: 'REGULAR' },
    { date: `${y}-06-12`, name: 'Independence Day', type: 'REGULAR' },
    { date: `${y}-08-21`, name: 'Ninoy Aquino Day', type: 'SPECIAL_NON_WORKING' },
    { date: toIsoDate(getLastMondayOfAugust(y)), name: 'National Heroes Day', type: 'REGULAR' },
    { date: `${y}-11-01`, name: "All Saints' Day", type: 'SPECIAL_NON_WORKING' },
    { date: `${y}-11-02`, name: "All Souls' Day", type: 'SPECIAL_NON_WORKING' },
    { date: `${y}-11-30`, name: 'Bonifacio Day', type: 'REGULAR' },
    { date: `${y}-12-08`, name: 'Feast of the Immaculate Conception', type: 'SPECIAL_NON_WORKING' },
    { date: `${y}-12-24`, name: 'Christmas Eve', type: 'SPECIAL_NON_WORKING' },
    { date: `${y}-12-25`, name: 'Christmas Day', type: 'REGULAR' },
    { date: `${y}-12-30`, name: 'Rizal Day', type: 'REGULAR' },
    { date: `${y}-12-31`, name: 'Last Day of the Year', type: 'SPECIAL_NON_WORKING' },
  ];

  const easter = getEasterSunday(y);
  holidays.push({ date: toIsoDate(addDays(easter, -3)), name: 'Maundy Thursday', type: 'REGULAR' });
  holidays.push({ date: toIsoDate(addDays(easter, -2)), name: 'Good Friday', type: 'REGULAR' });
  holidays.push({ date: toIsoDate(addDays(easter, -1)), name: 'Black Saturday', type: 'SPECIAL_NON_WORKING' });

  if (ISLAMIC_HOLIDAYS[y]) {
    for (const islamic of ISLAMIC_HOLIDAYS[y]) {
      holidays.push(islamic);
    }
  }

  holidays.sort((a, b) => a.date.localeCompare(b.date));
  return holidays;
}

/**
 * Checks whether a given date is an official holiday and returns its metadata.
 */
export function getHolidayInfo(dateStr) {
  if (!dateStr) return null;
  const clean = String(dateStr).slice(0, 10);
  const year = parseInt(clean.slice(0, 4), 10);
  if (isNaN(year)) return null;
  const list = getOfficialHolidays(year);
  return list.find(h => h.date === clean) || null;
}

export function isOfficialHoliday(dateStr) {
  return Boolean(getHolidayInfo(dateStr));
}

export function noClassDaysFromSheets(sheets, calendarYear = null) {
  const days = {};

  // If a calendar year or month is specified, pre-populate official calendar holidays
  if (calendarYear) {
    const years = Array.isArray(calendarYear) ? calendarYear : [Number(calendarYear)];
    for (const yr of years) {
      if (yr && !isNaN(yr)) {
        for (const h of getOfficialHolidays(yr)) {
          days[h.date] = 'HOLIDAY';
        }
      }
    }
  }

  // Overlay saved sheets from the database
  for (const sheet of sheets || []) {
    const date = String(sheet.attendance_date || '').slice(0, 10);
    if (!date) continue;
    if (NO_CLASS_LABELS[sheet.no_class_reason]) {
      days[date] = sheet.no_class_reason;
    } else if (sheet.no_class_reason === null && (sheet.attendance_sheet_id || sheet.id)) {
      // If the adviser explicitly removed the marker for this sheet, respect it
      delete days[date];
    }
  }
  return days;
}

export function classDaysForMonth(schoolDays, noClassDays) {
  return schoolDays.filter(day => !noClassDays[day.dateStr]);
}
