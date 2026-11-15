// Developer-only read-only report. Never exposed by an application route.
process.env.AIVEN_DATABASE_URL = '';
const db = require('../config/db');
const attendance = require('../services/AttendanceMonitoringService');

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--school-year' || !/^\d+$/.test(args[1]))) {
    throw new Error('Usage: node scripts/audit-attendance-monitoring.js [--school-year ID]');
  }
  const options = await attendance.options(db);
  const schoolYear = args[1] || options.defaultSchoolYear;
  const report = await attendance.preview(db, { schoolYear }, new Date(), { includeDiagnostics: true });
  const records = report.diagnostics.filter(student => student.incomplete);
  console.log(JSON.stringify({ context: report.context, totalStudents: report.summary.total, recordsNeedingReview: records.length, records }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
