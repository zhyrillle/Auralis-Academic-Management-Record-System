const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();
const mysql = require("mysql2/promise");
let connectionUri = process.env.DATABASE_URL;
const isLocal = connectionUri && (connectionUri.includes("localhost") || connectionUri.includes("127.0.0.1"));
const requiresSsl = process.env.DB_SSL === "true" || (!isLocal && connectionUri && connectionUri.includes("aivencloud.com"));

const pool = mysql.createPool({
  uri: connectionUri,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "Z",
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
});

console.log(`MySQL Connection Pool Initialized [Target: ${isLocal ? 'LOCAL (127.0.0.1)' : 'REMOTE CLOUD'}].`);

module.exports = pool;
