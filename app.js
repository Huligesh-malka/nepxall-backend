require("dotenv").config(); // ✅ LOAD ENV FIRST

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

/* ================= TRUST PROXY (RENDER) ================= */
app.set("trust proxy", 1);

/* ================= ROUTES ================= */
const authRoutes = require("./routes/authRoutes");
const agreementRoutes = require("./routes/agreementRoutes");
const depositRoutes = require("./routes/depositRoutes");
const vacateRoutes = require("./routes/vacateRoutes");
const pgRoutes = require("./routes/pgRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const roomRoutes = require("./routes/roomRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const ownerBookingRoutes = require("./routes/ownerBookingRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const adminRoutes = require("./routes/adminRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const ownerVerificationRoutes = require("./routes/ownerVerificationRoutes");
const adminOwnerVerificationRoutes = require("./routes/adminOwnerVerificationRoutes");
const privateChatRoutes = require("./routes/privateChatRoutes");
const announcementRoutes = require("./routes/announcementRoutes");
const pgChatRoutes = require("./routes/pgChatRoutes");
const aadhaarKycRoutes = require("./routes/adhar_routes");

/* ================= CREATE UPLOAD DIRS ================= */
[
  "uploads",
  "uploads/pg-photos",
  "uploads/pg-videos",
  "uploads/verification",
  "uploads/agreements",
  "uploads/agreement-signatures",
  "uploads/hotel-photos",
].forEach((dir) => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

/* ================= CORS ================= */

const allowedOrigins = [
  "http://localhost:3000",
  process.env.CLIENT_URL,
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // Postman / mobile apps

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS not allowed"), false);
    },
    credentials: true,
  })
);

/* ================= BODY PARSER ================= */

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/* ================= STATIC ================= */

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ================= HEALTH ================= */

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || "development",
  });
});

/* ================= DIAGNOSTIC ENDPOINT ================= */
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
    results.troubleshooting.push('   - Password is correct');
    results.troubleshooting.push('   - Database name is correct (defaultdb)');
    results.troubleshooting.push('   - SSL configuration is correct');
  }

  res.json(results);
});

/* ================= API ROUTES ================= */

// 🔐 AUTH
app.use("/api/auth", authRoutes);

// 👤 PG MODULE
app.use("/api/pg", pgRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/agreement", agreementRoutes);
app.use("/api/deposit", depositRoutes);
app.use("/api/vacate", vacateRoutes);
app.use("/api/payments", paymentRoutes);

// 💬 CHAT
app.use("/api/pg-chat", pgChatRoutes);
app.use("/api/private-chat", privateChatRoutes);
app.use("/api/announcements", announcementRoutes);

// 🏠 OWNER
app.use("/api/owner", ownerBookingRoutes);
app.use("/api/owner", ownerVerificationRoutes);

// 🛠 ADMIN
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminOwnerVerificationRoutes);

// ⭐ REVIEWS & NOTIFICATIONS
app.use("/api/reviews", reviewRoutes);
app.use("/api/notifications", notificationRoutes);

// 🆕 🔐 AADHAAR KYC
app.use("/api/kyc/aadhaar", aadhaarKycRoutes);

/* ================= 404 ================= */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

/* ================= GLOBAL ERROR ================= */

app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

module.exports = app;