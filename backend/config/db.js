const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();
const mysql = require("mysql2/promise");
let connectionUri = process.env.DATABASE_URL;

const pool = mysql.createPool({
  uri: connectionUri,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "Z",

  ssl: {
    rejectUnauthorized: false,
  },
});

console.log("MySQL Connection Pool Initialized.");

module.exports = pool;
