require('dotenv').config();
const mysql = require('mysql2/promise');

const LOCAL_CONFIG = {
  host: process.env.LOCAL_DB_HOST || '127.0.0.1',
  port: Number(process.env.LOCAL_DB_PORT) || 3306,
  user: process.env.LOCAL_DB_USER || 'root',
  password: process.env.LOCAL_DB_PASSWORD || '',
  database: process.env.LOCAL_DB_NAME || 'auralis',
};

const AIVEN_URL = process.env.AIVEN_DATABASE_URL;

async function deduplicateDatabase(conn, name) {
  console.log(`\n====================================================`);
  console.log(`🔍 Checking & Deduplicating GRADE_SHEET in ${name}...`);
  console.log(`====================================================`);

  const [dups] = await conn.query(`
    SELECT subject_offering_id, term_id, COUNT(*) as cnt, GROUP_CONCAT(grade_sheet_id ORDER BY grade_sheet_id) as ids
    FROM GRADE_SHEET
    GROUP BY subject_offering_id, term_id
    HAVING COUNT(*) > 1
  `);

  if (dups.length === 0) {
    console.log(`✅ No duplicate grade sheets found in ${name}.`);
  } else {
    console.log(`⚠️ Found ${dups.length} duplicate grade sheet pair(s) in ${name}:`);

    for (const group of dups) {
      const sheetIds = String(group.ids).split(',').map(Number);
      console.log(`\n👉 Offering ${group.subject_offering_id}, Term ${group.term_id}: candidate IDs [${sheetIds.join(', ')}]`);

      const [sheetDetails] = await conn.query(`
        SELECT gs.grade_sheet_id, gs.subject_offering_id, gs.term_id, gs.workflow_status, gs.lock_status, gs.submitted_at,
               (SELECT COUNT(*) FROM GRADE_ACTIVITY ga WHERE ga.grade_sheet_id = gs.grade_sheet_id) as activity_count,
               (SELECT COUNT(*) FROM SCORE sc JOIN GRADE_ACTIVITY ga ON ga.activity_id = sc.activity_id WHERE ga.grade_sheet_id = gs.grade_sheet_id) as score_count
        FROM GRADE_SHEET gs
        WHERE gs.grade_sheet_id IN (${sheetIds.join(',')})
      `);

      // Rank candidate sheets:
      // 1. Submitted status
      // 2. Highest score count
      // 3. Highest activity count
      // 4. Lowest ID (oldest)
      sheetDetails.sort((a, b) => {
        const aSub = (a.workflow_status === 'SUBMITTED' || a.submitted_at) ? 1 : 0;
        const bSub = (b.workflow_status === 'SUBMITTED' || b.submitted_at) ? 1 : 0;
        if (bSub !== aSub) return bSub - aSub;
        if (b.score_count !== a.score_count) return b.score_count - a.score_count;
        if (b.activity_count !== a.activity_count) return b.activity_count - a.activity_count;
        return a.grade_sheet_id - b.grade_sheet_id;
      });

      const authoritative = sheetDetails[0];
      const authoritativeId = authoritative.grade_sheet_id;
      console.log(`   🏆 Keeping authoritative sheet: ID ${authoritativeId} (scores: ${authoritative.score_count}, activities: ${authoritative.activity_count}, status: ${authoritative.workflow_status})`);

      for (let i = 1; i < sheetDetails.length; i++) {
        const redundant = sheetDetails[i];
        const redundantId = redundant.grade_sheet_id;
        console.log(`   🗑️ Consolidating redundant sheet: ID ${redundantId} (scores: ${redundant.score_count}, activities: ${redundant.activity_count})`);

        await conn.query('SET FOREIGN_KEY_CHECKS = 0;').catch(() => {});
        try {
          // Re-parent reopen requests
          await conn.query(`UPDATE GRADE_REOPEN_REQUEST SET grade_sheet_id = ? WHERE grade_sheet_id = ?`, [authoritativeId, redundantId]).catch(() => {});

          // If redundant sheet has activities with scores, re-parent activities to authoritative sheet if activity_name doesn't conflict
          const [redundantActivities] = await conn.query(`SELECT activity_id, activity_name FROM GRADE_ACTIVITY WHERE grade_sheet_id = ?`, [redundantId]);
          for (const act of redundantActivities) {
            const [existing] = await conn.query(
              `SELECT activity_id FROM GRADE_ACTIVITY WHERE grade_sheet_id = ? AND activity_name = ? LIMIT 1`,
              [authoritativeId, act.activity_name]
            );
            if (existing.length === 0) {
              await conn.query(`UPDATE GRADE_ACTIVITY SET grade_sheet_id = ? WHERE activity_id = ?`, [authoritativeId, act.activity_id]).catch(() => {});
            } else {
              // Activity already exists on authoritative sheet; re-link any scores to the authoritative activity if missing
              const authActId = existing[0].activity_id;
              await conn.query(
                `UPDATE IGNORE SCORE SET activity_id = ? WHERE activity_id = ?`,
                [authActId, act.activity_id]
              ).catch(() => {});
              await conn.query(`DELETE FROM SCORE WHERE activity_id = ?`, [act.activity_id]).catch(() => {});
              await conn.query(`DELETE FROM GRADE_ACTIVITY WHERE activity_id = ?`, [act.activity_id]).catch(() => {});
            }
          }

          // Clean up redundant sheet
          await conn.query(`DELETE FROM GRADE_SHEET WHERE grade_sheet_id = ?`, [redundantId]);
          console.log(`   ✅ Successfully removed duplicate sheet ID ${redundantId}`);
        } finally {
          await conn.query('SET FOREIGN_KEY_CHECKS = 1;').catch(() => {});
        }
      }
    }
  }

  // Ensure unique index uq_offering_term exists
  const [indexes] = await conn.query(`
    SHOW INDEX FROM GRADE_SHEET WHERE Key_name = 'uq_offering_term'
  `);

  if (indexes.length === 0) {
    console.log(`🔒 Adding UNIQUE KEY uq_offering_term (subject_offering_id, term_id) in ${name}...`);
    await conn.query(`
      ALTER TABLE GRADE_SHEET ADD UNIQUE KEY uq_offering_term (subject_offering_id, term_id)
    `);
    console.log(`✅ Unique constraint uq_offering_term added successfully in ${name}.`);
  } else {
    console.log(`✅ Unique constraint uq_offering_term is already active in ${name}.`);
  }
}

async function run() {
  console.log('💻 Connecting to Local MySQL (127.0.0.1:3306)...');
  const localConn = await mysql.createConnection(LOCAL_CONFIG);
  await deduplicateDatabase(localConn, 'Local MySQL');
  await localConn.end();

  if (AIVEN_URL) {
    console.log('☁️ Connecting to Aiven Cloud MySQL...');
    const aivenConn = await mysql.createConnection({
      uri: AIVEN_URL,
      ssl: { rejectUnauthorized: false },
    });
    await deduplicateDatabase(aivenConn, 'Aiven Cloud MySQL');
    await aivenConn.end();
  } else {
    console.warn('⚠️ AIVEN_DATABASE_URL is not set; skipped cloud deduplication.');
  }

  console.log('\n🎉 Deduplication and constraint verification complete!');
}

run().catch((err) => {
  console.error('❌ Error during deduplication:', err);
  process.exit(1);
});
