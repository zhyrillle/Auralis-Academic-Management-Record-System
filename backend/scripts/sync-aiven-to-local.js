require('dotenv').config();
const mysql = require('mysql2/promise');

const AIVEN_URL = process.env.AIVEN_DATABASE_URL || process.env.DATABASE_URL;
const LOCAL_CONFIG = {
  host: process.env.LOCAL_DB_HOST || '127.0.0.1',
  port: Number(process.env.LOCAL_DB_PORT) || 3306,
  user: process.env.LOCAL_DB_USER || 'root',
  password: process.env.LOCAL_DB_PASSWORD || '',
  database: process.env.LOCAL_DB_NAME || 'auralis',
  multipleStatements: true,
};

async function syncAivenToLocal() {
  console.log('====================================================');
  console.log('🔄 AURALIS: SYNC AIVEN CLOUD DB -> LOCAL XAMPP MYSQL');
  console.log('====================================================');

  console.log('☁️ Connecting to Aiven Cloud Database...');
  const aivenConn = await mysql.createConnection({
    uri: AIVEN_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log('💻 Connecting to Local MySQL (127.0.0.1:3306)...');
  const localConn = await mysql.createConnection(LOCAL_CONFIG);

  try {
    await localConn.query('SET FOREIGN_KEY_CHECKS = 0;');
    await localConn.query('SET @@check_constraint_checks = 0;').catch(() => {});
    await localConn.query("SET SESSION sql_mode = 'ANSI_QUOTES,NO_ENGINE_SUBSTITUTION';");

    // 1. Fetch all tables and views
    const [tableRows] = await aivenConn.query(
      `SELECT TABLE_NAME, TABLE_TYPE 
       FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = DATABASE()`
    );

    const baseTables = tableRows
      .filter((r) => r.TABLE_TYPE === 'BASE TABLE')
      .map((r) => r.TABLE_NAME);

    const views = tableRows
      .filter((r) => r.TABLE_TYPE === 'VIEW')
      .map((r) => r.TABLE_NAME);

    console.log(`\n📋 Found ${baseTables.length} base tables and ${views.length} views on Aiven.\n`);

    // 2. Recreate Base Tables and Sync Data
    for (const table of baseTables) {
      process.stdout.write(`⏳ Syncing table \`${table}\`... `);

      // Get table creation statement from Aiven
      const [createRes] = await aivenConn.query(`SHOW CREATE TABLE \`${table}\``);
      let createSql = createRes[0]['Create Table'];

      // Replace MySQL 8 specific collation with universal utf8mb4_unicode_ci for MariaDB/XAMPP
      createSql = createSql.replace(/utf8mb4_0900_ai_ci/g, 'utf8mb4_unicode_ci');
      createSql = createSql.replace(/utf8mb4_0900_as_cs/g, 'utf8mb4_unicode_ci');

      // Drop and recreate table on local
      await localConn.query(`DROP TABLE IF EXISTS "${table}"`);
      await localConn.query(createSql);

      // Fetch all rows from Aiven
      const [rows] = await aivenConn.query(`SELECT * FROM \`${table}\``);

      if (rows.length > 0) {
        // Exclude generated columns (e.g. mapeh_key) from the insert
        const [colsInfo] = await localConn.query(
          `SELECT COLUMN_NAME, EXTRA FROM information_schema.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
          [table]
        );
        const generatedCols = new Set(
          colsInfo.filter(c => c.EXTRA && c.EXTRA.toUpperCase().includes('GENERATED')).map(c => c.COLUMN_NAME)
        );
        const columns = Object.keys(rows[0]).filter(col => !generatedCols.has(col));
        const values = rows.map((row) =>
          columns.map((col) => {
            const val = row[col];
            if (
              val !== null &&
              typeof val === 'object' &&
              !(val instanceof Date) &&
              !Buffer.isBuffer(val)
            ) {
              return JSON.stringify(val);
            }
            return val;
          })
        );
        const insertSql = `INSERT INTO "${table}" ("${columns.join('", "')}") VALUES ?`;

        await localConn.query(insertSql, [values]);
        console.log(`✅ (${rows.length} rows migrated)`);
      } else {
        console.log(`✅ (0 rows / empty)`);
      }
    }

    // 3. Recreate Views
    for (const view of views) {
      process.stdout.write(`⏳ Syncing view \`${view}\`... `);
      try {
        const [createViewRes] = await aivenConn.query(`SHOW CREATE VIEW \`${view}\``);
        let createViewSql = createViewRes[0]['Create View'];
        createViewSql = createViewSql.replace(/DEFINER=`.*?`@`.*?`/, '');
        createViewSql = createViewSql.replace(/DEFINER=".*?"@".*?"/, '');
        createViewSql = createViewSql.replace(/utf8mb4_0900_ai_ci/g, 'utf8mb4_unicode_ci');

        await localConn.query(`DROP VIEW IF EXISTS "${view}"`);
        await localConn.query(createViewSql);
        console.log('✅ View created');
      } catch (viewErr) {
        console.warn(`⚠️ Skipped view ${view}: ${viewErr.message}`);
      }
    }

    await localConn.query('SET FOREIGN_KEY_CHECKS = 1;');
    await localConn.query('SET @@check_constraint_checks = 1;').catch(() => {});

    console.log('\n====================================================');
    console.log('🎉 SYNC COMPLETE! All data copied to local MySQL.');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ Sync failed:', err.message);
  } finally {
    await aivenConn.end();
    await localConn.end();
  }
}

syncAivenToLocal().catch(console.error);
