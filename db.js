const mysql = require("mysql2/promise");

console.log("🔧 Initializing database connection...");

// Use the exact same configuration that worked in diagnostic
const dbConfig = {
  host: process.env.MYSQLHOST,
  port: Number(process.env.MYSQLPORT),
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000, // Add timeout
  ssl: {
    rejectUnauthorized: false // Critical for Aiven
  }
};

// Log config (without password)
console.log("📊 DB Config:", {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  ssl: !!dbConfig.ssl,
  passwordSet: !!dbConfig.password
});

const pool = mysql.createPool(dbConfig);

// Test connection immediately
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log("✅ MySQL Pool Connected Successfully");
    
    // Test query
    const [rows] = await conn.query('SELECT 1 + 1 AS solution');
    console.log("📊 Test query:", rows[0].solution === 2 ? "Passed" : "Failed");
    
    conn.release();
  } catch (err) {
    console.error("❌ MySQL connection failed:");
    console.error("Error Code:", err.code);
    console.error("Error Message:", err.message);
    console.error("Error Errno:", err.errno);
    
    if (err.code === 'ETIMEDOUT') {
      console.error("🔧 TIMEOUT ISSUE - Check:");
      console.error("   1. SSL configuration (must be { rejectUnauthorized: false })");
      console.error("   2. Connect timeout setting");
      console.error("   3. Network latency");
    }
  }
})();

module.exports = pool;