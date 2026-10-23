require('dotenv').config();
const mysql = require('mysql2/promise');

const LOCAL_CONFIG = {
  host: process.env.LOCAL_DB_HOST || '127.0.0.1',
  port: Number(process.env.LOCAL_DB_PORT) || 3306,
  user: process.env.LOCAL_DB_USER || 'root',
  password: process.env.LOCAL_DB_PASSWORD || '',
  database: process.env.LOCAL_DB_NAME || 'auralis',
  multipleStatements: true,
};

const AIVEN_URL = process.env.AIVEN_DATABASE_URL;

async function pushLocalToAiven() {
  console.log('====================================================');
  console.log('☁️ AURALIS: PUSH LOCAL SCORES -> AIVEN CLOUD DB');
  console.log('====================================================');

  if (!AIVEN_URL) {
    console.error('❌ AIVEN_DATABASE_URL is not set in .env');
    return;
  }

  console.log('💻 Connecting to Local MySQL (127.0.0.1:3306)...');
  const localConn = await mysql.createConnection(LOCAL_CONFIG);

  console.log('☁️ Connecting to Aiven Cloud MySQL...');
  const aivenConn = await mysql.createConnection({
    uri: AIVEN_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // 0. Sync local users to Aiven Cloud
    const [localUsers] = await localConn.query('SELECT * FROM USER;');
    console.log(`👤 Checking ${localUsers.length} local users...`);
    for (const u of localUsers) {
      await aivenConn.query(
        `INSERT INTO USER (user_id, role, department_id, first_name, middle_name, last_name, extension_name, email, password, account_status, pfp_url, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           role = VALUES(role),
           department_id = VALUES(department_id),
           first_name = VALUES(first_name),
           middle_name = VALUES(middle_name),
           last_name = VALUES(last_name),
           extension_name = VALUES(extension_name),
           account_status = VALUES(account_status),
           pfp_url = VALUES(pfp_url);`,
        [u.user_id, u.role, u.department_id, u.first_name, u.middle_name, u.last_name, u.extension_name, u.email, u.password, u.account_status, u.pfp_url, u.last_login_at]
      );
    }
    console.log('✅ Users verified and synced to Aiven.');

    // 1. Check max score_id on Aiven
    const [aivenStats] = await aivenConn.query('SELECT MAX(score_id) as max_id, COUNT(*) as count FROM SCORE;');
    const aivenMaxId = aivenStats[0].max_id || 0;
    console.log(`📊 Aiven current status: ${aivenStats[0].count} scores (Max ID: ${aivenMaxId})`);

    // 2. Fetch all scores from local that are new or updated
    const [localScores] = await localConn.query(
      'SELECT score_id, activity_id, student_section_id, raw_score, score_status, teacher_assignment_id, created_at, updated_at FROM score WHERE score_id > ? ORDER BY score_id ASC;',
      [aivenMaxId]
    );

    console.log(`🔍 Found ${localScores.length} newly entered scores in local database.`);

    if (localScores.length > 0) {
      console.log('⏳ Uploading new scores to Aiven Cloud...');

      for (const row of localScores) {
        await aivenConn.query(
          `INSERT INTO SCORE (score_id, activity_id, student_section_id, raw_score, score_status, teacher_assignment_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
             raw_score = VALUES(raw_score),
             score_status = VALUES(score_status),
             updated_at = VALUES(updated_at);`,
          [
            row.score_id,
            row.activity_id,
            row.student_section_id,
            row.raw_score,
            row.score_status,
            row.teacher_assignment_id,
            row.created_at,
            row.updated_at,
          ]
        );
      }

      console.log(`✅ Successfully uploaded ${localScores.length} scores to Aiven!`);
    } else {
      console.log('✅ Aiven is already up to date with local scores.');
    }

    // 3. Verify final state on Aiven
    const [finalStats] = await aivenConn.query('SELECT MAX(score_id) as max_id, COUNT(*) as count FROM SCORE;');
    console.log('\n====================================================');
    console.log(`🎉 SUCCESS! Aiven now has ${finalStats[0].count} scores (Max ID: ${finalStats[0].max_id})`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('❌ Failed to push to Aiven:', err.message);
  } finally {
    await localConn.end();
    await aivenConn.end();
  }
}

pushLocalToAiven().catch(console.error);
