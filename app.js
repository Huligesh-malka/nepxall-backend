const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();

/* ================= TRUST PROXY ================= */
app.set("trust proxy", 1);

/* ================= SECURITY ================= */
app.use(helmet());

/* ================= LOGGER ================= */
app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.originalUrl}`);
  next();
});

/* ======================================================
   💳 CASHFREE WEBHOOK (RAW BODY ONLY)
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
  "http://localhost:5173",
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (origin.includes("vercel.app")) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    console.log("❌ Blocked by CORS:", origin);
    return callback(null, true); // allow in production
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🚀 Nepxall Backend API",
    environment: process.env.NODE_ENV,
    time: new Date(),
  });
});

/* ================= HEALTH ================= */
app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "healthy" });
});

/* ================= DB WARMUP ================= */
setInterval(async () => {
  try {
    const db = require("./db");
    await db.query("SELECT 1");
    console.log("🔥 DB Warmup success");
  } catch (err) {
    console.log("⚠️ DB Warmup failed:", err.message);
  }
}, 5 * 60 * 1000);

/* ======================================================
   🧠 SAFE ROUTE LOADER
====================================================== */
const safeLoad = (path) => {
  try {
    const route = require(path);
    console.log("✅ Loaded:", path);
    return route;
  } catch (err) {
    console.error("❌ Failed:", path, err.message);
    return express.Router();
  }
};

/* ================= CORE ROUTES ================= */
app.use("/api/auth", safeLoad("./routes/authRoutes"));
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
app.use("/api/private-chat", safeLoad("./routes/privateChatRoutes")); // ⭐ IMPORTANT
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

/* ================= 404 ================= */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `❌ Route ${req.originalUrl} not found`,
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