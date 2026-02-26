const mysql = require("mysql2/promise");

console.log("🔧 Initializing database connection...");

const isProduction = process.env.NODE_ENV === "production";

// SSL Certificate for Aiven
let sslConfig = { rejectUnauthorized: false }; // Default fallback

// If SSL certificate is provided in environment variables
if (isProduction && process.env.SSL_CA_CERT) {
  try {
    // Clean up the certificate string - remove any extra quotes or whitespace
    let cert = process.env.SSL_CA_CERT.trim();
    
    // If the certificate includes the BEGIN/END lines, use it directly
    if (cert.includes('-----BEGIN CERTIFICATE-----')) {
      sslConfig = {
        ca: cert,
        rejectUnauthorized: true // Set to true when using proper certificate
      };
      console.log("✅ SSL: Using provided CA certificate");
    } else {
      console.log("⚠️ SSL: Certificate format invalid, using rejectUnauthorized: false");
    }
  } catch (error) {
    console.error("❌ SSL: Error parsing certificate:", error.message);
    console.log("⚠️ SSL: Falling back to rejectUnauthorized: false");
  }
} else if (isProduction) {
  console.log("⚠️ SSL: No certificate provided, using rejectUnauthorized: false");
}

// Base configuration
const baseConfig = {
  host: isProduction ? process.env.MYSQLHOST : (process.env.LOCAL_DB_HOST || "localhost"),
  port: isProduction ? Number(process.env.MYSQLPORT) : (Number(process.env.LOCAL_DB_PORT) || 3306),
  user: isProduction ? process.env.MYSQLUSER : (process.env.LOCAL_DB_USER || "root"),
  password: isProduction ? process.env.MYSQLPASSWORD : (process.env.LOCAL_DB_PASSWORD || ""),
  ssl: isProduction ? sslConfig : undefined,
};

// Full configuration with database
const dbConfig = {
  ...baseConfig,
  database: isProduction ? process.env.MYSQLDATABASE : process.env.LOCAL_DB_NAME,
};

// Debug (safe)
console.log("📊 DB Config:", {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  ssl: dbConfig.ssl ? (dbConfig.ssl.ca ? 'Certificate provided' : 'rejectUnauthorized: false') : 'No SSL',
  env: process.env.NODE_ENV,
});

// Create pool with error handling
const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

// Function to ensure database exists
async function ensureDatabaseExists() {
  if (!isProduction) return true;

  let connection;
  try {
    // Connect without database specified
    connection = await mysql.createConnection({
      host: baseConfig.host,
      port: baseConfig.port,
      user: baseConfig.user,
      password: baseConfig.password,
      ssl: baseConfig.ssl,
    });

    console.log("✅ Connected to MySQL server (without database)");

    // Check if database exists
    const [databases] = await connection.query("SHOW DATABASES");
    const databaseList = databases.map(db => Object.values(db)[0]);
    
    console.log("📊 Available databases:", databaseList.join(', '));

    const targetDB = dbConfig.database;
    
    if (!databaseList.includes(targetDB)) {
      console.log(`🔧 Database '${targetDB}' does not exist. Creating...`);
      
      // Create database
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${targetDB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`✅ Database '${targetDB}' created successfully`);
    } else {
      console.log(`✅ Database '${targetDB}' already exists`);
    }

    return true;
  } catch (error) {
    console.error("❌ Failed to ensure database exists:");
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    
    if (error.code === 'ENOTFOUND') {
      console.error("💡 Tip: Check if the hostname is correct and accessible");
    } else if (error.code === 'ECONNREFUSED') {
      console.error("💡 Tip: Check if the port is correct and database is running");
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error("💡 Tip: Check your username and password");
    } else if (error.code === 'HOST_NOT_ALLOWED') {
      console.error("💡 Tip: Your IP might need to be whitelisted in Aiven");
    }
    
    return false;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Function to test connection with retries
async function testConnection(retries = 3, delay = 5000) {
  for (let i = 1; i <= retries; i++) {
    try {
      console.log(`🔄 Connection attempt ${i}/${retries}...`);
      
      const conn = await pool.getConnection();
      console.log(`✅ MySQL Connected to database: ${dbConfig.database}`);

      // Test query
      const [rows] = await conn.query("SELECT 1+1 AS result");
      console.log("📊 Test Query Result:", rows[0].result);

      // Get database info - COMPLETELY FIXED VERSION
      // Using individual queries instead of a combined one to avoid syntax issues
      try {
        // Get current database
        const [dbResult] = await conn.query("SELECT DATABASE() AS current_db");
        console.log("📊 Current Database:", dbResult[0].current_db);
        
        // Get current user
        const [userResult] = await conn.query("SELECT CURRENT_USER() AS current_user");
        console.log("📊 Current User:", userResult[0].current_user);
        
        // Get version
        const [versionResult] = await conn.query("SELECT VERSION() AS version");
        console.log("📊 MySQL Version:", versionResult[0].version);
        
        console.log("📊 Database Info Summary:", {
          current_database: dbResult[0].current_db,
          current_user: userResult[0].current_user,
          version: versionResult[0].version
        });
      } catch (queryError) {
        console.error("❌ Error getting database info:", queryError.message);
        // Ultra simple fallback - just try to get version
        try {
          const [simpleResult] = await conn.query("SELECT VERSION() as v");
          console.log("📊 MySQL Version (simple):", simpleResult[0].v);
        } catch (fallbackError) {
          console.log("📊 Could not retrieve any database info");
        }
      }

      // List tables if any
      try {
        const [tables] = await conn.query("SHOW TABLES");
        if (tables.length > 0) {
          const tableNames = tables.map(t => Object.values(t)[0]);
          console.log("📊 Tables in database:", tableNames.join(', '));
        } else {
          console.log("📊 No tables found in database");
          console.log("💡 Database is empty. You may need to run migrations or import your schema.");
        }
      } catch (tableError) {
        console.log("📊 Could not retrieve table list:", tableError.message);
      }

      conn.release();
      console.log("✅ Database connection test successful!");
      return true;
    } catch (err) {
      console.error(`❌ Connection attempt ${i} failed:`);
      console.error("Error code:", err.code);
      console.error("Error message:", err.message);
      
      if (err.code === 'ER_BAD_DB_ERROR') {
        console.error(`💡 Database '${dbConfig.database}' does not exist. Attempting to create it...`);
        
        const dbCreated = await ensureDatabaseExists();
        if (dbCreated) {
          console.log("✅ Database created. Retrying connection...");
          // Continue to next retry
        } else {
          console.error("❌ Could not create database. Please create it manually.");
        }
      } else if (err.code === 'ENOTFOUND') {
        console.error(`💡 Host '${dbConfig.host}' not found. Check:`);
        console.error("   - The hostname is correct");
        console.error(`   - Current host: ${dbConfig.host}`);
        console.error("   - Your database server is running");
      } else if (err.code === 'ETIMEDOUT') {
        console.error(`💡 Connection timed out. Check:`);
        console.error("   - The port is correct");
        console.error(`   - Current port: ${dbConfig.port}`);
        console.error("   - Your firewall allows the connection");
      } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error(`💡 Access denied. Check your username and password:`);
        console.error(`   - User: ${dbConfig.user}`);
        console.error("   - Password: [HIDDEN]");
      } else if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.error("💡 Connection lost. This might be due to SSL issues.");
        console.error("   Try using rejectUnauthorized: false if you haven't already.");
      } else if (err.code === 'ER_PARSE_ERROR') {
        console.error("💡 SQL Syntax error. This might be due to:");
        console.error("   - Special characters in the query");
        console.error("   - Database version compatibility");
        console.error("   - Using individual queries instead of combined ones");
      }
      
      if (i < retries) {
        console.log(`⏳ Waiting ${delay/1000} seconds before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error("❌ All connection attempts failed");
        return false;
      }
    }
  }
}

// Initialize connection
(async () => {
  try {
    console.log("🔧 Starting database initialization...");
    console.log(`📡 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    
    // Validate required environment variables
    if (isProduction) {
      const requiredVars = ['MYSQLHOST', 'MYSQLPORT', 'MYSQLUSER', 'MYSQLPASSWORD', 'MYSQLDATABASE'];
      const missingVars = requiredVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        console.error("❌ Missing required environment variables:", missingVars.join(', '));
        process.exit(1);
      }
    }
    
    // For production, first ensure database exists
    if (isProduction) {
      console.log("🔧 Checking database existence...");
      await ensureDatabaseExists();
    }
    
    // Test the connection
    const connected = await testConnection(3, 5000);
    
    if (!connected) {
      console.error("\n❌ COULD NOT ESTABLISH DATABASE CONNECTION");
      console.error("==========================================");
      console.error("\n💡 TROUBLESHOOTING STEPS:");
      console.error("1. Verify your database connection details:");
      console.error(`   Host: ${dbConfig.host}`);
      console.error(`   Port: ${dbConfig.port}`);
      console.error(`   User: ${dbConfig.user}`);
      console.error(`   Database: ${dbConfig.database}`);
      console.error("\n2. For Aiven, ensure:");
      console.error("   - You're using the correct hostname from Aiven console");
      console.error("   - Your IP is whitelisted (or Public Access is enabled)");
      console.error("   - SSL is properly configured");
      console.error("\n3. Test connection manually:");
      console.error(`   mysql -h ${dbConfig.host} -P ${dbConfig.port} -u ${dbConfig.user} -p ${dbConfig.database} --ssl-mode=REQUIRED`);
      console.error("\n4. Check if the database exists:");
      console.error(`   mysql -h ${dbConfig.host} -P ${dbConfig.port} -u ${dbConfig.user} -p -e "SHOW DATABASES;"`);
      console.error("==========================================");
      
      // Don't exit in development, but in production we might want to
      if (isProduction) {
        console.error("\n❌ Exiting due to database connection failure in production");
        process.exit(1);
      }
    } else {
      console.log("✅ Database initialization complete!");
    }
  } catch (error) {
    console.error("❌ Fatal error during database initialization:", error);
    if (isProduction) {
      process.exit(1);
    }
  }
})();

// Handle pool errors
pool.on('error', (err) => {
  console.error('❌ Unexpected database pool error:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('💡 Database connection was lost. The pool will handle reconnection.');
  } else if (err.code === 'ER_HOST_NOT_PRIVILEGED') {
    console.error('💡 Host not privileged. Check if your IP is whitelisted in Aiven.');
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔧 Closing database pool...');
  await pool.end();
  console.log('✅ Database pool closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔧 Closing database pool...');
  await pool.end();
  console.log('✅ Database pool closed');
  process.exit(0);
});

module.exports = pool;