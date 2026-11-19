/**
 * Official Philippine Holidays Calendar Service
 * Computes official regular holidays and special non-working days for any school year / calendar year,
 * and handles database synchronisation / auto-population into ATTENDANCE_SHEET and OFFICIAL_HOLIDAY.
 */

const db = require('../config/db');

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

/**
 * Computes Gregorian Easter Sunday using the Meeus/Jones/Butcher algorithm
 */
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

/**
 * Computes the last Monday of August (National Heroes Day)
 */
function getLastMondayOfAugust(year) {
  const d = new Date(Date.UTC(year, 7, 31)); // Aug 31
  const dow = d.getUTCDay(); // 0 is Sun, 1 is Mon
  const diff = dow >= 1 ? dow - 1 : 6;
  d.setUTCDate(31 - diff);
  return d;
}

/**
 * Returns all official Philippine holidays for a given calendar year.
 * @param {number} year - Four-digit year
 * @returns {Array<{ date: string, name: string, type: 'REGULAR'|'SPECIAL_NON_WORKING' }>}
 */
function getOfficialHolidaysForYear(year) {
  const y = Number(year);
  const pad = num => String(num).padStart(2, '0');

  // Fixed regular and special holidays
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

  // Holy Week (movable based on Easter)
  const easter = getEasterSunday(y);
  holidays.push({ date: toIsoDate(addDays(easter, -3)), name: 'Maundy Thursday', type: 'REGULAR' });
  holidays.push({ date: toIsoDate(addDays(easter, -2)), name: 'Good Friday', type: 'REGULAR' });
  holidays.push({ date: toIsoDate(addDays(easter, -1)), name: 'Black Saturday', type: 'SPECIAL_NON_WORKING' });

  // Islamic movable holidays (if mapped)
  if (ISLAMIC_HOLIDAYS[y]) {
    for (const islamic of ISLAMIC_HOLIDAYS[y]) {
      holidays.push(islamic);
    }
  }

  // Sort chronologically
  holidays.sort((a, b) => a.date.localeCompare(b.date));
  return holidays;
}

/**
 * Returns a Map of date -> holiday object for all years in the range.
 */
function getOfficialHolidaysMap(startYear, endYear) {
  const map = new Map();
  for (let y = Number(startYear); y <= Number(endYear); y++) {
    for (const h of getOfficialHolidaysForYear(y)) {
      map.set(h.date, h);
    }
  }
  return map;
}

/**
 * Checks whether a date string (YYYY-MM-DD) is an official holiday.
 * @param {string} dateStr
 * @returns {{ date: string, name: string, type: string } | null}
 */
function isOfficialHoliday(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.slice(0, 10);
  const year = parseInt(clean.slice(0, 4), 10);
  if (isNaN(year)) return null;
  const holidays = getOfficialHolidaysForYear(year);
  return holidays.find(h => h.date === clean) || null;
}

/**
 * Ensures the OFFICIAL_HOLIDAY table exists in the database and is populated.
 */
let ensuredTable = false;
async function ensureOfficialHolidaysTable(database = db) {
  if (ensuredTable) return;
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS OFFICIAL_HOLIDAY (
        holiday_id BIGINT PRIMARY KEY AUTO_INCREMENT,
        holiday_name VARCHAR(100) NOT NULL,
        holiday_date DATE NOT NULL,
        holiday_type ENUM('REGULAR', 'SPECIAL_NON_WORKING') NOT NULL DEFAULT 'REGULAR',
        UNIQUE KEY uq_holiday_date (holiday_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);

    // Insert holidays for 2024 through 2028
    const holidays = [];
    for (let y = 2024; y <= 2028; y++) {
      holidays.push(...getOfficialHolidaysForYear(y));
    }

    for (const h of holidays) {
      await database.query(
        `INSERT IGNORE INTO OFFICIAL_HOLIDAY (holiday_name, holiday_date, holiday_type) VALUES (?, ?, ?)`,
        [h.name, h.date, h.type]
      );
    }
    ensuredTable = true;
  } catch (err) {
    console.warn('Could not ensure OFFICIAL_HOLIDAY table:', err.message);
  }
}

/**
 * Automatically populates official holiday sheets for a specific section and school year.
 * Finds the adviser assignment for the section and creates ATTENDANCE_SHEET rows with
 * no_class_reason = 'HOLIDAY' for every official holiday on Monday-Friday.
 */
async function autoPopulateSectionHolidays(sectionId, schoolYearId = null, database = db) {
  if (!sectionId) return [];
  try {
    await ensureOfficialHolidaysTable(database);

    // 1. Resolve adviser assignment
    let adviserAssignmentId = null;
    let resolvedSchoolYearId = schoolYearId;

    let saaQuery = `SELECT adviser_assignment_id, school_year_id FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id = ?`;
    const params = [sectionId];
    if (resolvedSchoolYearId) {
      saaQuery += ` AND school_year_id = ?`;
      params.push(resolvedSchoolYearId);
    }
    saaQuery += ` ORDER BY adviser_assignment_id DESC LIMIT 1`;
    const [saaRows] = await database.execute(saaQuery, params);

    if (saaRows.length > 0) {
      adviserAssignmentId = saaRows[0].adviser_assignment_id;
      if (!resolvedSchoolYearId) resolvedSchoolYearId = saaRows[0].school_year_id;
    }

    if (!resolvedSchoolYearId) {
      const [syRows] = await database.execute(`SELECT school_year_id FROM SCHOOL_YEAR WHERE status = 'ongoing' LIMIT 1`);
      resolvedSchoolYearId = syRows[0]?.school_year_id || 1;
    }

    // 2. Resolve school year boundaries
    const [syData] = await database.execute(
      `SELECT starts_on, ends_on FROM SCHOOL_YEAR WHERE school_year_id = ?`,
      [resolvedSchoolYearId]
    );

    const startYear = syData[0]?.starts_on || 2026;
    const endYear = syData[0]?.ends_on || startYear + 1;

    // Collect all official holidays across startYear and endYear
    const candidateHolidays = [];
    for (let y = startYear; y <= endYear; y++) {
      candidateHolidays.push(...getOfficialHolidaysForYear(y));
    }

    // Filter to weekdays (Mon-Fri)
    const weekdayHolidays = candidateHolidays.filter(h => {
      const d = new Date(`${h.date}T00:00:00Z`);
      const dow = d.getUTCDay();
      return dow >= 1 && dow <= 5;
    });

    if (weekdayHolidays.length === 0 || !adviserAssignmentId) {
      return [];
    }

    // 3. For each weekday holiday, check if ATTENDANCE_SHEET already exists
    const inserted = [];
    const cloudSync = require('./cloudSyncService');

    for (const hol of weekdayHolidays) {
      const [existing] = await database.execute(
        `SELECT attendance_sheet_id, no_class_reason FROM ATTENDANCE_SHEET
         WHERE adviser_assignment_id = ? AND attendance_date = ? AND attendance_scope = 'SECTION'`,
        [adviserAssignmentId, hol.date]
      );

      if (existing.length === 0) {
        const [res] = await database.execute(
          `INSERT INTO ATTENDANCE_SHEET (adviser_assignment_id, attendance_scope, attendance_date, no_class_reason)
           VALUES (?, 'SECTION', ?, 'HOLIDAY')`,
          [adviserAssignmentId, hol.date]
        );
        inserted.push({ attendance_sheet_id: res.insertId, date: hol.date, name: hol.name });
        if (cloudSync?.forwardAttendanceSheetToCloud) {
          cloudSync.forwardAttendanceSheetToCloud(res.insertId, {
            adviser_assignment_id: adviserAssignmentId,
            attendance_scope: 'SECTION',
            attendance_date: hol.date,
            no_class_reason: 'HOLIDAY',
          }).catch(() => {});
        }
      }
    }

    return inserted;
  } catch (err) {
    console.warn('Could not auto-populate section holidays:', err.message);
    return [];
  }
}

module.exports = {
  getOfficialHolidaysForYear,
  getOfficialHolidaysMap,
  isOfficialHoliday,
  ensureOfficialHolidaysTable,
  autoPopulateSectionHolidays,
};
