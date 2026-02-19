const mysql = require("mysql2/promise");

console.log("🔧 Initializing database connection...");

// Use environment variables with fallbacks for local development
const dbConfig = {
  host: process.env.MYSQLHOST || "localhost",
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "Huli@123",
  database: process.env.MYSQLDATABASE || "rent_system",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Only log in development mode
if (process.env.NODE_ENV !== 'production') {
  console.log("📊 DB Config:", {
    host: dbConfig.host,
    user: dbConfig.user,
    database: dbConfig.database,
    password: dbConfig.password ? "****" : "not set"
  });
}

const db = mysql.createPool(dbConfig);

(async () => {
  try {
    const conn = await db.getConnection();
    console.log("✅ MySQL Pool Connected Successfully");
    
    // Test query
    const [rows] = await conn.query('SELECT 1 + 1 AS solution');
    console.log("📊 Test query:", rows[0].solution === 2 ? "Passed" : "Failed");
    
    conn.release();
  } catch (err) {
    console.error("❌ MySQL connection failed:");
    console.error("Error Code:", err.code);
    console.error("Error Message:", err.message);
    
    if (err.code === 'ECONNREFUSED') {
      console.error("🔧 Make sure MySQL server is running locally");
    }
  }
})();

module.exports = db;