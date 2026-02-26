const mysql = require("mysql2/promise");

console.log("🔧 Initializing database connection...");

const isProduction = process.env.NODE_ENV === "production";

const dbConfig = isProduction
  ? {
      host: process.env.MYSQLHOST,
      port: Number(process.env.MYSQLPORT),
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: process.env.LOCAL_DB_HOST || "localhost",
      port: Number(process.env.LOCAL_DB_PORT) || 3306,
      user: process.env.LOCAL_DB_USER || "root",
      password: process.env.LOCAL_DB_PASSWORD || "",
      database: process.env.LOCAL_DB_NAME,
    };

const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
});

// Debug (safe)
console.log("📊 DB Config:", {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  ssl: !!dbConfig.ssl,
  env: process.env.NODE_ENV,
});

(async () => {
  try {
    const conn = await pool.getConnection();
    console.log("✅ MySQL Connected");

    const [rows] = await conn.query("SELECT 1+1 AS result");
    console.log("📊 Test Query:", rows[0].result);

    conn.release();
  } catch (err) {
    console.error("❌ MySQL connection failed");
    console.error(err);
  }
})();

module.exports = pool;