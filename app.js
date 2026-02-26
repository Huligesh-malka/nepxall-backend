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
  "http://localhost:5000",
  "https://nepxall-backend.onrender.com",
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, etc)
      if (!origin) return callback(null, true);
      
      // Allow all vercel.app subdomains
      if (origin.includes("vercel.app")) {
        return callback(null, true);
      }
      
      // Check against allowed origins
      if (allowedOrigins.includes(origin)) {
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

/* ================= ROOT ROUTE ================= */
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Nepxall Backend API",
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
    endpoints: {
      health: "/api/health",
      diagnose: "/api/diagnose",
      auth: "/api/auth",
      pg: "/api/pg",
      rooms: "/api/rooms",
      bookings: "/api/bookings",
      payments: "/api/payments",
      owner: "/api/owner",
      admin: "/api/admin",
    },
    documentation: "https://github.com/Huligesh-malka/nepxall-backend",
    timestamp: new Date().toISOString(),
  });
});

/* ================= HEALTH ================= */
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/* ================= DIAGNOSTIC ================= */
app.get("/api/diagnose", async (req, res) => {
  try {
    const pool = require("./db");
    const [result] = await pool.query("SELECT 1+1 as test");
    
    res.json({
      success: true,
      environment: process.env.NODE_ENV,
      database: {
        connected: true,
        test_query: result[0].test,
      },
      firebase: process.env.FIREBASE_SERVICE_ACCOUNT ? "configured" : "missing",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      environment: process.env.NODE_ENV,
      database: {
        connected: false,
        error: error.message,
      },
      firebase: process.env.FIREBASE_SERVICE_ACCOUNT ? "configured" : "missing",
      timestamp: new Date().toISOString(),
    });
  }
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
    return express.Router(); // Return empty router instead of crashing
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

/* ================= SOCIAL ROUTES ================= */
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
app.use("/api/owner", safeLoad("./routes/ownerBankRoutes"));

/* ====================================================== */
/* 🛡 ADMIN ROUTES */
/* ====================================================== */
app.use("/api/admin", safeLoad("./routes/adminRoutes"));
app.use("/api/admin", safeLoad("./routes/adminOwnerVerificationRoutes"));
app.use("/api/admin/settlements", safeLoad("./routes/adminSettlementRoutes"));

app.get("/api/admin/health", (req, res) => {
  res.json({ success: true, message: "Admin API working ✅" });
});

/* ================= 404 HANDLER ================= */
app.use((req, res) => {
  console.log(`🚫 404 - Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    availableEndpoints: [
      "/",
      "/api/health",
      "/api/diagnose",
      "/api/auth",
      "/api/pg",
      "/api/rooms",
      "/api/bookings",
      "/api/payments",
      "/api/owner",
      "/api/admin",
    ],
  });
});

/* ================= GLOBAL ERROR HANDLER ================= */
app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", err.stack);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    error: process.env.NODE_ENV === "development" ? err : {},
  });
});

module.exports = app;