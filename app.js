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
    💳 CASHFREE WEBHOOK (MUST BE BEFORE GENERAL JSON PARSER)
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
    if (!origin || origin.includes("vercel.app") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.log("❌ Blocked by CORS:", origin);
    return callback(null, true); // Set to false in strict production
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

/* ================= 🧠 SAFE ROUTE LOADER ================= */
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
app.get("/", (req, res) => res.json({ success: true, message: "🚀 Nepxall Backend API" }));
app.get("/api/health", (req, res) => res.json({ success: true, status: "healthy" }));

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

/* ✅ SERVICES ROUTE */
app.use("/api/services", safeLoad("./routes/serviceRoutes"));

/* ================= SOCIAL & OWNER & ADMIN ================= */
app.use("/api/pg-chat", safeLoad("./routes/pgChatRoutes"));
app.use("/api/private-chat", safeLoad("./routes/privateChatRoutes"));
app.use("/api/announcements", safeLoad("./routes/announcementRoutes"));
app.use("/api/reviews", safeLoad("./routes/reviewRoutes"));
app.use("/api/notifications", safeLoad("./routes/notificationRoutes"));
app.use("/api/owner", safeLoad("./routes/ownerBookingRoutes"));
app.use("/api/owner", safeLoad("./routes/ownerVerificationRoutes"));
app.use("/api/owner", safeLoad("./routes/ownerBankRoutes"));

/* ================= ADMIN CORE ================= */
app.use("/api/admin", safeLoad("./routes/adminRoutes"));
app.use("/api/admin/settlements", safeLoad("./routes/adminSettlementRoutes"));

/* ================= ✅ NEW: ADMIN SERVICE MANAGEMENT ================= */
app.use("/api/admin/services", safeLoad("./routes/adminServiceRoutes"));

/* ================= ✅ NEW: VENDOR ROUTES ================= */
app.use("/api/vendor", safeLoad("./routes/vendorRoutes"));

/* ================= 404 & ERROR HANDLING ================= */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `❌ Route ${req.originalUrl} not found`
  });
});

app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

module.exports = app;