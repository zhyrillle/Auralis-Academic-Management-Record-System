require('dotenv').config();
const mysql = require('mysql2/promise');
let connectionUri = process.env.DATABASE_URL;

const pool = mysql.createPool({
  uri: connectionUri,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  
  ssl: {
    rejectUnauthorized: false
  }
});

console.log('MySQL Connection Pool Initialized.');

module.exports = pool;