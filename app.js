require("dotenv").config(); // ✅ LOAD ENV FIRST

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

/* ================= TRUST PROXY (RENDER) ================= */
app.set("trust proxy", 1);

/* ================= DIAGNOSTIC ENDPOINT - AT THE VERY TOP ================= */
app.get('/api/diagnose', async (req, res) => {
  console.log("🔧 Diagnostic endpoint hit!"); // Add this log
  
  const results = {
    timestamp: new Date().toISOString(),
    message: "Diagnostic endpoint is working",
    environment: {
      node_env: process.env.NODE_ENV,
      render_url: process.env.RENDER_EXTERNAL_URL || 'Not set',
      all_env_keys: Object.keys(process.env).filter(key => !key.includes('PASSWORD') && !key.includes('SECRET'))
    },
    mysql: {
      host: process.env.MYSQLHOST || 'Not set',
      port: process.env.MYSQLPORT || 'Not set',
      user: process.env.MYSQLUSER || 'Not set',
      database: process.env.MYSQLDATABASE || 'Not set',
      passwordSet: !!process.env.MYSQLPASSWORD
    }
  };

  // Test DNS resolution
  try {
    const dns = require('dns').promises;
    const dnsResult = await dns.lookup(results.mysql.host);
    results.dns = { success: true, address: dnsResult.address };
  } catch (err) {
    results.dns = { success: false, error: err.message };
  }

  res.json(results);
});

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
      if (!origin) return callback(null, true);
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