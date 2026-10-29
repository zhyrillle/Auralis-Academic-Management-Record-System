// John Doe's eight explicitly requested English classes, Term 2 only.
// Dry run by default; --apply requires a backup folder. Never submits grades.
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const { populate } = require('./populate-john-doe-english-testing');
const sectionNames = ['Balete', 'Banaba', 'Dao', 'Ipil', 'Kamagong', 'Lauan', 'Talisay', 'Yakal'];

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const backupDir = args.find(arg => arg.startsWith('--backup-dir='))?.slice('--backup-dir='.length);
  const today = args.find(arg => arg.startsWith('--through='))?.slice('--through='.length)
    || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  if (apply) assert(backupDir, 'Supply --backup-dir before applying test data.');
  const db = require('../config/db');
  try {
    assert(db.cloudPool || !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL), 'The shared database is required.');
    const report = await populate(db.cloudPool || db, { apply, today, backupDir, sectionNames,
      termNames: ['2nd'], requireAdviser: false });
    console.log(JSON.stringify(report));
  } finally {
    await db.end();
    if (db.cloudPool) await db.cloudPool.end();
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { sectionNames };
