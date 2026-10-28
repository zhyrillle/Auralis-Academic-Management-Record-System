const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();
const mysql = require("mysql2/promise");
let connectionUri = process.env.DATABASE_URL;
const isLocal = connectionUri && (connectionUri.includes("localhost") || connectionUri.includes("127.0.0.1"));
const requiresSsl = process.env.DB_SSL === "true" || (!isLocal && connectionUri && connectionUri.includes("aivencloud.com"));
const cleanUri = connectionUri ? connectionUri.replace(/[?&]ssl-mode=[^&]+/i, "") : connectionUri;

let pool = mysql.createPool({
  uri: cleanUri,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "Z",
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
});

console.log(`MySQL Connection Pool Initialized [Target: ${isLocal ? 'LOCAL (127.0.0.1)' : 'REMOTE CLOUD'}].`);

// Secondary cloud pool for dual-writing to Aiven (team shared progress)
let cloudPool = null;
if (process.env.AIVEN_DATABASE_URL && isLocal) {
  try {
    const cleanCloudUri = process.env.AIVEN_DATABASE_URL.replace(/[?&]ssl-mode=[^&]+/i, "");
    cloudPool = mysql.createPool({
      uri: cleanCloudUri,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      timezone: "Z",
      ssl: { rejectUnauthorized: false },
    });
    console.log("☁️ Cloud Connection Pool (Aiven) Initialized for dual writes.");
  } catch (err) {
    console.warn("Could not initialize cloud pool:", err.message);
  }
}

pool.cloudPool = cloudPool;

module.exports = pool;

