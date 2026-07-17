require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runSchema() {
  console.log('Connecting to Aiven MySQL...');
  
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  try {
    console.log('📖 Reading schema.sql...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    const statements = sql
      .split(';')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);

    console.log(`Executing ${statements.length} SQL statements...`);
    for (const statement of statements) {
      await connection.query(statement);
    }

    console.log('Tables created successfully in the cloud!');
  } catch (error) {
    console.error('Error building database:', error.message);
  } finally {
    await connection.end();
  }
}

runSchema();