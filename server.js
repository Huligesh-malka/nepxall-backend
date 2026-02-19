const http = require("http");
const app = require("./app");
const { initSocket } = require("./socket");

const PORT = process.env.PORT || 5000;

/* 🌍 CREATE HTTP SERVER */
const server = http.createServer(app);

/* 🔥 INIT SOCKET.IO */
initSocket(server);

/* 🔧 ADD DIAGNOSTIC ENDPOINT */
app.get('/api/diagnose', async (req, res) => {
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      node_env: process.env.NODE_ENV,
      render_url: process.env.RENDER_EXTERNAL_URL || 'Not set'
    },
    mysql: {
      host: process.env.MYSQLHOST || 'Not set',
      port: process.env.MYSQLPORT || 'Not set',
      user: process.env.MYSQLUSER || 'Not set',
      database: process.env.MYSQLDATABASE || 'Not set',
      passwordSet: !!process.env.MYSQLPASSWORD
    },
    diagnostics: {
      dns: null,
      network: null,
      connection: null
    }
  };

  const net = require('net');
  const dns = require('dns').promises;
  const mysql = require('mysql2/promise');

  // Test DNS resolution
  try {
    const dnsResult = await dns.lookup(results.mysql.host);
    results.diagnostics.dns = { 
      success: true, 
      address: dnsResult.address,
      family: dnsResult.family 
    };
  } catch (err) {
    results.diagnostics.dns = { 
      success: false, 
      error: err.message 
    };
  }

  // Test TCP connection if DNS succeeded
  if (results.diagnostics.dns?.success) {
    try {
      const socket = new net.Socket();
      const tcpResult = await new Promise((resolve) => {
        socket.setTimeout(5000);
        socket.on('connect', () => {
          socket.destroy();
          resolve({ success: true, message: '✅ TCP connection successful' });
        });
        socket.on('timeout', () => {
          socket.destroy();
          resolve({ success: false, message: '❌ TCP connection timeout' });
        });
        socket.on('error', (error) => {
          resolve({ success: false, message: `❌ TCP error: ${error.message}` });
        });
        socket.connect(Number(results.mysql.port), results.mysql.host);
      });
      results.diagnostics.network = tcpResult;
    } catch (err) {
      results.diagnostics.network = { 
        success: false, 
        error: err.message 
      };
    }
  }

  // Test MySQL connection if TCP succeeded
  if (results.diagnostics.network?.success) {
    try {
      const connection = await mysql.createConnection({
        host: results.mysql.host,
        port: Number(results.mysql.port),
        user: results.mysql.user,
        password: process.env.MYSQLPASSWORD,
        database: results.mysql.database,
        ssl: { rejectUnauthorized: false },
        connectTimeout: 5000
      });
      
      const [rows] = await connection.query('SELECT 1 + 1 as solution, VERSION() as version, DATABASE() as db, USER() as user');
      await connection.end();
      
      results.diagnostics.connection = { 
        success: true, 
        message: '✅ MySQL connection successful',
        details: {
          solution: rows[0].solution,
          version: rows[0].version,
          database: rows[0].db,
          user: rows[0].user
        }
      };
    } catch (err) {
      results.diagnostics.connection = { 
        success: false, 
        error: err.code,
        message: err.message,
        sqlState: err.sqlState,
        errno: err.errno
      };
    }
  }

  // Add helpful troubleshooting tips
  results.troubleshooting = [];
  
  if (!results.diagnostics.dns?.success) {
    results.troubleshooting.push('🔧 DNS lookup failed - Check if MYSQLHOST is correct');
  }
  
  if (!results.diagnostics.network?.success && results.diagnostics.dns?.success) {
    results.troubleshooting.push('🔧 TCP connection failed - Check if:');
    results.troubleshooting.push('   - Port is correct (should be 24425)');
    results.troubleshooting.push('   - Aiven service is running');
    results.troubleshooting.push('   - No firewall blocking Render IPs');
  }
  
  if (!results.diagnostics.connection?.success && results.diagnostics.network?.success) {
    results.troubleshooting.push('🔧 MySQL authentication failed - Check if:');
    results.troubleshooting.push('   - Username is correct (avnadmin)');
    results.troubleshooting.push('   - Password is correct (AVNS_iQ3edhNLqRxVfWa2W2q)');
    results.troubleshooting.push('   - Database name is correct (defaultdb)');
    results.troubleshooting.push('   - SSL configuration is correct');
  }

  res.json(results);
});

/* 🚀 START SERVER */
server.listen(PORT, () => {
  console.log("=================================");
  console.log(`🚀 Server running in ${process.env.NODE_ENV || "development"} mode`);
  console.log(`📡 Port: ${PORT}`);

  /* 🌍 SHOW LIVE URL IF ON RENDER */
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log(`🌍 Live URL: ${process.env.RENDER_EXTERNAL_URL}`);
    console.log(`❤️ Health Check: ${process.env.RENDER_EXTERNAL_URL}/api/health`);
    console.log(`🔧 Diagnostic: ${process.env.RENDER_EXTERNAL_URL}/api/diagnose`);
  } else {
    /* 💻 LOCAL URL */
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`❤️ Health Check: http://localhost:${PORT}/api/health`);
    console.log(`🔧 Diagnostic: http://localhost:${PORT}/api/diagnose`);
  }

  console.log("=================================");
});