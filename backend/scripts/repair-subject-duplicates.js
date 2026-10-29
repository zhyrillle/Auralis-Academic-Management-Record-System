// Dry run by default. --apply requires --backup-dir=<folder outside the repository>.
// Keeps historical offerings and never deletes grades, scores, or attendance.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const identifier = name => {
  assert.match(name, /^[a-zA-Z0-9_]+$/);
  return '`' + name + '`';
};
const idsSql = ids => ids.map(() => '?').join(',');
const protectedTables = ['GRADE_SHEET', 'GRADE_ACTIVITY', 'SCORE', 'STUDENT_GRADE',
  'ATTENDANCE_SHEET', 'ATTENDANCE', 'PHIL_IRI_ASSESSMENT', 'PHIL_IRI_SCREENING', 'GRADE_REOPEN_REQUEST'];

async function repair(pool, target, { apply, backupDir, preferredTeacherIds = new Set() }) {
  const c = await pool.getConnection();
  const backup = { target, capturedAt: new Date().toISOString(), references: [] };
  try {
    await c.beginTransaction();
    const [offerings] = await c.execute('SELECT * FROM SUBJECT_OFFERING ORDER BY subject_offering_id FOR UPDATE');
    const [assignments] = await c.execute('SELECT * FROM TEACHER_ASSIGNMENT ORDER BY teacher_assignment_id FOR UPDATE');
    const [columns] = await c.execute(`SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('subject_offering_id', 'teacher_assignment_id')`);
    const references = column => columns.filter(row => row.COLUMN_NAME === column
      && row.TABLE_NAME.toUpperCase() !== (column === 'subject_offering_id' ? 'SUBJECT_OFFERING' : 'TEACHER_ASSIGNMENT'));
    const groups = (rows, key) => {
      const result = new Map();
      for (const row of rows) { const k = key(row); if (!result.has(k)) result.set(k, []); result.get(k).push(row); }
      return [...result.values()].filter(rows => rows.length > 1);
    };
    const offeringGroups = groups(offerings, row => `${row.section_id}:${row.subject_id}:${row.school_year_id}`);
    const teacherGroups = groups(assignments, row => `${row.subject_offering_id}:${row.user_id}`);
    const referenceCounts = new Map();
    for (const [column, duplicateGroups, key] of [
      ['subject_offering_id', offeringGroups, 'subject_offering_id'],
      ['teacher_assignment_id', teacherGroups, 'teacher_assignment_id'],
    ]) {
      const ids = duplicateGroups.flat().map(row => row[key]);
      if (!ids.length) continue;
      for (const ref of references(column)) {
        const [rows] = await c.query(`SELECT * FROM ${identifier(ref.TABLE_NAME)}
          WHERE ${identifier(column)} IN (${idsSql(ids)}) FOR UPDATE`, ids);
        backup.references.push({ table: ref.TABLE_NAME, column, rows });
        for (const row of rows) {
          const key = `${column}:${row[column]}`;
          referenceCounts.set(key, (referenceCounts.get(key) || 0) + 1);
        }
      }
    }
    const counts = async () => {
      const result = {};
      for (const table of protectedTables) {
        const [[row]] = await c.query(`SELECT COUNT(*) AS n FROM ${identifier(table)}`);
        result[table] = Number(row.n);
      }
      return result;
    };
    const before = await counts();
    const offeringPlan = offeringGroups.flatMap(rows => {
      rows.sort((a, b) => (referenceCounts.get(`subject_offering_id:${b.subject_offering_id}`) || 0)
        - (referenceCounts.get(`subject_offering_id:${a.subject_offering_id}`) || 0)
        || Number(a.subject_offering_id) - Number(b.subject_offering_id));
      return rows.slice(1).map(row => {
        assert.equal(referenceCounts.get(`subject_offering_id:${row.subject_offering_id}`) || 0, 0,
          'A duplicate offering has its own records; review it before consolidation.');
        return { keep: rows[0].subject_offering_id, remove: row.subject_offering_id };
      });
    });
    const realDateCount = row => ['assigned_from', 'assigned_until']
      .filter(key => row[key] && new Date(row[key]).getUTCFullYear() >= 1901).length;
    const teacherPlan = teacherGroups.flatMap(rows => {
      rows.sort((a, b) => Number(preferredTeacherIds.has(Number(b.teacher_assignment_id)))
        - Number(preferredTeacherIds.has(Number(a.teacher_assignment_id))) || realDateCount(b) - realDateCount(a)
        || (referenceCounts.get(`teacher_assignment_id:${b.teacher_assignment_id}`) || 0)
          - (referenceCounts.get(`teacher_assignment_id:${a.teacher_assignment_id}`) || 0)
        || Number(a.teacher_assignment_id) - Number(b.teacher_assignment_id));
      return rows.slice(1).map(row => ({ keep: rows[0].teacher_assignment_id,
        remove: row.teacher_assignment_id, userId: row.user_id, offeringId: row.subject_offering_id }));
    });
    Object.assign(backup, { offerings: offeringGroups.flat(), assignments: teacherGroups.flat(), before, offeringPlan, teacherPlan });
    let backupFile = null;
    if (apply) {
      assert(backupDir, 'Supply --backup-dir before applying database changes.');
      fs.mkdirSync(backupDir, { recursive: true });
      backupFile = path.join(backupDir, `${target}-${Date.now()}-before.json`);
      fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), { flag: 'wx' });
      for (const move of teacherPlan) {
        for (const ref of references('teacher_assignment_id')) {
          await c.execute(`UPDATE ${identifier(ref.TABLE_NAME)} SET teacher_assignment_id = ? WHERE teacher_assignment_id = ?`,
            [move.keep, move.remove]);
        }
        const [deleted] = await c.execute('DELETE FROM TEACHER_ASSIGNMENT WHERE teacher_assignment_id = ?', [move.remove]);
        assert.equal(deleted.affectedRows, 1);
      }
      for (const move of offeringPlan) {
        const [deleted] = await c.execute('DELETE FROM SUBJECT_OFFERING WHERE subject_offering_id = ?', [move.remove]);
        assert.equal(deleted.affectedRows, 1);
      }
      assert.deepEqual(await counts(), before, 'School record counts must remain unchanged.');
      await c.commit();
      for (const [table, name, fields] of [
        ['SUBJECT_OFFERING', 'uq_subject_section_year', ['subject_id', 'section_id', 'school_year_id']],
        ['TEACHER_ASSIGNMENT', 'uq_teacher_offering_user', ['subject_offering_id', 'user_id']],
      ]) {
        const [indices] = await c.query(`SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
          FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND NON_UNIQUE = 0
          GROUP BY INDEX_NAME`, [table]);
        if (!indices.some(row => row.cols === fields.join(','))) {
          await c.query(`ALTER TABLE ${identifier(table)} ADD UNIQUE KEY ${identifier(name)} (${fields.map(identifier).join(',')})`);
        }
      }
    } else await c.rollback();
    return { target, applied: apply, offeringPlan, teacherPlan, protectedRecordsPreserved: true, backupFile };
  } catch (error) { await c.rollback(); throw error; }
  finally { c.release(); }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const backupDir = args.find(arg => arg.startsWith('--backup-dir='))?.slice('--backup-dir='.length);
  if (apply && !backupDir) throw new Error('Supply --backup-dir before applying database changes.');
  const db = require('../config/db');
  try {
    let preferredTeacherIds = new Set();
    if (db.cloudPool) {
      const cloudResult = await repair(db.cloudPool, 'shared-cloud', { apply, backupDir });
      preferredTeacherIds = new Set(cloudResult.teacherPlan.map(row => Number(row.keep)));
      console.log(JSON.stringify(cloudResult));
    }
    console.log(JSON.stringify(await repair(db, 'primary', { apply, backupDir, preferredTeacherIds })));
  } finally { await db.end(); if (db.cloudPool) await db.cloudPool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { repair };
