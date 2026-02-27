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

/* ======================================================
   💳 CASHFREE WEBHOOK (RAW BODY REQUIRED)
====================================================== */
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
  "http://localhost:5000",
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (origin.includes("vercel.app")) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("❌ Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Nepxall Backend API 🚀",
    environment: process.env.NODE_ENV,
    timestamp: new Date(),
  });
});

/* ================= HEALTH ================= */
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    uptime: process.uptime(),
  });
});

/* ================= DIAGNOSE ================= */
app.get("/api/diagnose", async (req, res) => {
  try {
    const db = require("./db");
    const [test] = await db.query("SELECT 1+1 as result");

    res.json({
      success: true,
      db: "connected",
      test: test[0].result,
      firebase: process.env.FIREBASE_SERVICE_ACCOUNT
        ? "configured"
        : "missing",
      cloudinary: {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? "configured" : "missing",
        api_key: process.env.CLOUDINARY_API_KEY ? "configured" : "missing",
        api_secret: process.env.CLOUDINARY_API_SECRET ? "configured" : "missing",
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      db: "failed",
      error: err.message,
    });
  }
});

/* ======================================================
   🧠 SAFE ROUTE LOADER
====================================================== */
const safeLoad = (routePath) => {
  try {
    const route = require(routePath);
    console.log(`✅ Loaded: ${routePath}`);
    return route;
  } catch (err) {
    console.error(`❌ Failed: ${routePath}`);
    console.error(err.message);
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

/* ================= OWNER ================= */
app.use("/api/owner", safeLoad("./routes/ownerBookingRoutes"));
app.use("/api/owner", safeLoad("./routes/ownerVerificationRoutes"));
app.use("/api/owner", safeLoad("./routes/ownerBankRoutes"));

/* ================= ADMIN ================= */
app.use("/api/admin", safeLoad("./routes/adminRoutes"));
app.use("/api/admin", safeLoad("./routes/adminOwnerVerificationRoutes"));
app.use("/api/admin/settlements", safeLoad("./routes/adminSettlementRoutes"));

app.get("/api/admin/health", (req, res) => {
  res.json({ success: true, message: "Admin working ✅" });
});

/* ================= 404 ================= */
app.use((req, res) => {
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