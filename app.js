require("dotenv").config(); // ✅ LOAD ENV FIRST

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

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

/* 🆕 KYC ROUTE */
const aadhaarKycRoutes = require("./routes/adhar_routes");

/* ================= CREATE UPLOAD DIRS ================= */
[
  "uploads",
  "uploads/pg-photos",
  "uploads/pg-videos",
  "uploads/verification",
  "uploads/agreements",
  "uploads/agreement-signatures",
  "uploads/hotel-photos"
].forEach((dir) => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

/* ================= MIDDLEWARE ================= */

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

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

/* 🆕 🔐 AADHAAR KYC */
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
