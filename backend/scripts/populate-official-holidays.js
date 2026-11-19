/**
 * Run official holidays migration and auto-populate ATTENDANCE_SHEET holidays for all adviser assignments
 */

require('dotenv').config();
const db = require('../config/db');
const { ensureOfficialHolidaysTable, autoPopulateSectionHolidays } = require('../services/OfficialHolidayService');

async function main() {
  console.log('Running official holidays population...');
  const pool = db;
  await ensureOfficialHolidaysTable(pool);

  // Get all active section adviser assignments
  const [saaRows] = await pool.query(`SELECT DISTINCT section_id, school_year_id FROM SECTION_ADVISER_ASSIGNMENT`);
  console.log(`Found ${saaRows.length} section adviser assignments.`);

  let totalInserted = 0;
  for (const row of saaRows) {
    const inserted = await autoPopulateSectionHolidays(row.section_id, row.school_year_id, pool);
    totalInserted += inserted.length;
    if (inserted.length > 0) {
      console.log(`Section ${row.section_id} (SY ${row.school_year_id}): auto-populated ${inserted.length} holiday sheets.`);
    }
  }

  console.log(`Done! Total holiday sheets auto-populated: ${totalInserted}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Failed to populate official holidays:', err);
  process.exit(1);
});
