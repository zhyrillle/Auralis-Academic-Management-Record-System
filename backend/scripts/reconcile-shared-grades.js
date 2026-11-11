// Apply only an explicitly reviewed shared preview: --approved-preview=<file.json>.
// Source data and planned values are checked again while locked, before any UPDATE.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const db = require('../config/db');
const { readSnapshot, buildPlan, applyPlan } = require('../services/GradeReconciliationService');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const comparable = value => canonical(JSON.parse(JSON.stringify(value)));
function assertSame(actual, expected, message) {
  if (JSON.stringify(comparable(actual)) !== JSON.stringify(comparable(expected))) throw new Error(message);
}

async function reconcileShared(pool, previewPath) {
  if (!pool || ['localhost', '127.0.0.1', '::1'].includes(pool.pool.config.connectionConfig.host)) {
    throw new Error('An explicitly configured shared database connection is required.');
  }
  if (!previewPath) throw new Error('An approved preview file is required.');
  const approved = JSON.parse(fs.readFileSync(previewPath, 'utf8'));
  if (approved.version !== 1 || approved.target !== 'shared' || !approved.snapshot || !approved.plan?.updates?.length) {
    throw new Error('Choose a nonempty shared-database repair preview.');
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const snapshot = await readSnapshot(connection, { lock: true });
    const plan = buildPlan(snapshot, { schoolYearId: approved.plan.schoolYearId });
    assertSame(snapshot, approved.snapshot, 'Shared records changed since preview; review a fresh preview first.');
    assertSame(plan, approved.plan, 'The proposed correction changed since approval.');
    const backupPath = path.join(path.dirname(path.resolve(previewPath)), `before-shared-grade-repair-${crypto.randomUUID()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ version: 1, target: 'shared', mode: 'before-shared-repair',
      createdAt: new Date().toISOString(), approvedPreview: path.resolve(previewPath), plan, snapshot }, null, 2), { flag: 'wx' });
    const auditIds = await applyPlan(connection, plan, { backupPath, source: 'approved-shared-grade-reconciliation' });
    const after = await readSnapshot(connection);
    const verified = buildPlan(after, { schoolYearId: plan.schoolYearId });
    assert.equal(verified.updates.length, 0, 'Recalculable mismatches remain; rolling back.');
    for (const field of ['activities', 'scores', 'weights', 'configs', 'enrollments', 'sheets', 'offerings', 'periods']) {
      assertSame(after[field], snapshot[field], `${field} unexpectedly changed; rolling back.`);
    }
    const updated = new Set(plan.updates.map(row => row.gradeId));
    assert.equal(after.grades.length, snapshot.grades.length, 'Saved grade row count changed.');
    assertSame(after.grades.filter(row => !updated.has(Number(row.student_grade_id))),
      snapshot.grades.filter(row => !updated.has(Number(row.student_grade_id))), 'An unapproved grade row changed.');
    await connection.commit();
    return { applied: true, changed: plan.updates.length, remainingRecalculableMismatches: 0,
      needsReview: verified.skipped.length, auditEntries: auditIds.length, backupPath,
      sections: [...new Set(plan.updates.map(row => `${row.grade} ${row.section}`))] };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

if (require.main === module) reconcileShared(db.cloudPool,
  process.argv.find(arg => arg.startsWith('--approved-preview='))?.slice('--approved-preview='.length))
  .then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { await db.end(); if (db.cloudPool) await db.cloudPool.end(); });

module.exports = { reconcileShared };
