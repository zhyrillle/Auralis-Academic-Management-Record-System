require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
  console.log('🔌 Attempting to connect to your Aiven MySQL database...');
  try {
    // Establish connection using the DATABASE_URL from your .env
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    console.log('✅ Connection successful!');

    // Query your newly created SCHOOL table to see if it exists
    const [rows] = await connection.query('SHOW TABLES;');
    console.log('\n📊 Tables currently inside your database:');
    console.table(rows);

    await connection.end();
    console.log('\n🔌 Connection closed safely.');
  } catch (error) {
    console.error('❌ Database connection failed!');
    console.error(error.message);
  }
}

testConnection();