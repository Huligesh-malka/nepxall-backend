const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

/* ================= TRUST PROXY ================= */
app.set("trust proxy", 1);

/* ================= LOGGER ================= */
app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.originalUrl}`);
  next();
});

/* ================= CASHFREE WEBHOOK ================= */
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    try {
      const webhookController = require("./controllers/paymentWebhookController");
      webhookController.cashfreeWebhook(req, res);
    } catch (err) {
      console.error("❌ Webhook Error:", err.message);
      res.status(500).send("Webhook handler error");
    }
  }
);

/* ================= BODY PARSER ================= */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/* ================= CORS ================= */
const allowedOrigins = [
  "http://localhost:3000",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origin.includes("vercel.app") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.log("❌ Blocked by CORS:", origin);
      callback(new Error("CORS not allowed"));
    },
    credentials: true,
  })
);

/* ================= STATIC ================= */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ================= HEALTH ================= */
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    uptime: process.uptime(),
  });
});

/* ====================================================== */
/* SAFE ROUTE LOADER */
/* ====================================================== */
const safeLoad = (routePath) => {
  try {
    const route = require(routePath);
    console.log(`✅ Loaded: ${routePath}`);
    return route;
  } catch (err) {
    console.error(`❌ Failed to load: ${routePath}`);
    console.error("👉", err.message);
    return express.Router();
  }
};

/* ================= CORE ROUTES ================= */

app.use("/api/auth", safeLoad("./routes/authRoutes"));
app.use("/api/kyc/aadhaar", safeLoad("./routes/adhar_routes"));
app.use("/api/pg", safeLoad("./routes/pgRoutes"));
app.use("/api/rooms", safeLoad("./routes/roomRoutes"));
app.use("/api/upload", safeLoad("./routes/uploadRoutes"));
app.use("/api/bookings", safeLoad("./routes/bookingRoutes"));
app.use("/api/agreement", safeLoad("./routes/agreementRoutes"));
app.use("/api/deposit", safeLoad("./routes/depositRoutes"));
app.use("/api/vacate", safeLoad("./routes/vacateRoutes"));
app.use("/api/payments", safeLoad("./routes/paymentRoutes"));
app.use("/api/movein", safeLoad("./routes/kycMoveinRoutes"));

/* ================= SOCIAL ================= */

app.use("/api/pg-chat", safeLoad("./routes/pgChatRoutes"));
app.use("/api/private-chat", safeLoad("./routes/privateChatRoutes"));
app.use("/api/announcements", safeLoad("./routes/announcementRoutes"));
app.use("/api/reviews", safeLoad("./routes/reviewRoutes"));
app.use("/api/notifications", safeLoad("./routes/notificationRoutes"));

/* ====================================================== */
/* 👑 OWNER ROUTES */
/* ====================================================== */

app.use("/api/owner", safeLoad("./routes/ownerBookingRoutes"));
app.use("/api/owner", safeLoad("./routes/ownerVerificationRoutes"));

/* ✅ ✅ ADD THIS LINE */
app.use("/api/owner", safeLoad("./routes/ownerBankRoutes"));

/* ====================================================== */
/* 🛡 ADMIN ROUTES */
/* ====================================================== */

app.use("/api/admin", safeLoad("./routes/adminRoutes"));
app.use("/api/admin", safeLoad("./routes/adminOwnerVerificationRoutes"));
app.use("/api/admin/settlements", require("./routes/adminSettlementRoutes"));

app.get("/api/admin/health", (req, res) => {
  res.json({ success: true, message: "Admin API working ✅" });
});

/* ================= 404 ================= */

app.use((req, res) => {
  console.log(`🚫 404 - Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

/* ================= GLOBAL ERROR ================= */

app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", err.stack);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

module.exports = app;