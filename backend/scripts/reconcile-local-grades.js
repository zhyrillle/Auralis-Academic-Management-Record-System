// Preview: node scripts/reconcile-local-grades.js --school-year=1
// Apply to an isolated LOCAL database: add --apply-local. Creates a durable JSON backup first.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('../config/db');
const { readSnapshot, buildPlan, applyPlan } = require('../services/GradeReconciliationService');

async function reconcile(pool, { schoolYearId, apply = false, outputDirectory = os.tmpdir() }) {
  const host = pool.pool.config.connectionConfig.host;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('This repair supports only a local database.');
  if (apply && pool.cloudPool) throw new Error('Pause the local cloud connection before applying the repair.');
  const connection = await pool.getConnection();
  try {
    await connection.query(apply ? 'START TRANSACTION' : 'START TRANSACTION READ ONLY');
    const snapshot = await readSnapshot(connection, { lock: apply });
    const plan = buildPlan(snapshot, { schoolYearId });
    fs.mkdirSync(outputDirectory, { recursive: true });
    const backupPath = path.join(outputDirectory, `auralis-grade-repair-${Date.now()}-${crypto.randomUUID()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ version: 1, createdAt: new Date().toISOString(),
      mode: apply ? 'before-local-repair' : 'preview', database: pool.pool.config.connectionConfig.database,
      plan, snapshot }, null, 2), { flag: 'wx' });
    if (apply) {
      await applyPlan(connection, plan, { backupPath, source: 'local-grade-reconciliation' });
      const verified = buildPlan(await readSnapshot(connection), { schoolYearId });
      if (verified.updates.length) throw new Error('Verification still found recalculable mismatches; rolling back.');
      await connection.commit();
    } else await connection.rollback();
    return { applied: apply, changed: apply ? plan.updates.length : 0, proposed: plan.updates.length,
      alreadyMatching: plan.matching, needsReview: plan.skipped.length, backupPath,
      sections: [...new Set(plan.updates.map(row => `${row.grade} ${row.section}`))] };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const schoolYearId = Number(args.find(arg => arg.startsWith('--school-year='))?.split('=')[1]);
  reconcile(db, { schoolYearId, apply: args.includes('--apply-local') })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(async () => { await db.end(); if (db.cloudPool) await db.cloudPool.end(); });
}
module.exports = { reconcile };
