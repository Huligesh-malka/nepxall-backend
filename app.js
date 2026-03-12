const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();

/* ================= TRUST PROXY ================= */

app.set("trust proxy", 1);

/* ================= LOGGER ================= */

app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.originalUrl}`);
  next();
});

/* ================= BODY PARSER ================= */

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/* ================= CORS ================= */

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://nepxall.vercel.app",
  "https://nepxall-app.vercel.app",
  "https://nepxall-frontend.vercel.app",
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {

    if (!origin) return callback(null, true);

    if (
      allowedOrigins.includes(origin) ||
      origin.includes("vercel.app")
    ) {
      return callback(null, true);
    }

    console.log("❌ Blocked by CORS:", origin);

    return callback(new Error("Not allowed by CORS"));
  },

  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization"
  ],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

/* HANDLE PREFLIGHT */

app.options("*", cors(corsOptions));

/* ================= SECURITY ================= */

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

/* ================= SAFE ROUTE LOADER ================= */

const safeLoad = (path) => {

  try {

    console.log(`📂 Attempting to load: ${path}`);

    const route = require(path);

    console.log("✅ Successfully loaded:", path);

    return route;

  } catch (err) {

    console.error("❌ Failed to load:", path, err.message);

    const dummyRouter = express.Router();

    dummyRouter.use((req, res) => {

      res.status(500).json({
        success: false,
        message: `Route ${req.originalUrl} not properly configured`
      });

    });

    return dummyRouter;

  }

};

/* ================= ROOT ROUTES ================= */

app.get("/", (req, res) => {

  res.json({
    success: true,
    message: "🚀 Nepxall Backend API Running",
    timestamp: new Date().toISOString()
  });

});

app.get("/api/health", (req, res) => {

  res.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString()
  });

});

/* ================= CORE ROUTES ================= */

console.log("\n📦 Loading Core Routes...");

app.use("/api/auth", safeLoad("./routes/authRoutes"));
app.use("/api/pg", safeLoad("./routes/pgRoutes"));
app.use("/api/rooms", safeLoad("./routes/roomRoutes"));
app.use("/api/upload", safeLoad("./routes/uploadRoutes"));
app.use("/api/bookings", safeLoad("./routes/bookingRoutes"));

/* ================= AGREEMENT ROUTES ================= */

console.log("\n📄 Loading Agreement Routes...");

app.use("/api/agreement", safeLoad("./routes/agreementRoutes"));

app.use(
  "/api/agreements-form",
  safeLoad("./routes/agreementsFormRoutes")
);

app.use("/api/deposit", safeLoad("./routes/depositRoutes"));
app.use("/api/vacate", safeLoad("./routes/vacateRoutes"));

/* ================= QR SCAN ROUTES ================= */

console.log("\n📱 Loading QR Scan Routes...");

app.use("/api/scan", safeLoad("./routes/qrScanRoutes"));

/* ================= PAYMENT ROUTES ================= */

console.log("\n💳 Loading Payment Routes...");

app.use("/api/payments", safeLoad("./routes/paymentRoutes"));

/* ================= MOVE-IN / KYC ================= */

console.log("\n📋 Loading Move-in/KYC Routes...");

app.use("/api/movein", safeLoad("./routes/kycMoveinRoutes"));

/* ================= SERVICES ================= */

console.log("\n🛠️ Loading Service Routes...");

app.use("/api/services", safeLoad("./routes/serviceRoutes"));

/* ================= CHAT & SOCIAL ================= */

console.log("\n💬 Loading Chat & Social Routes...");

app.use("/api/pg-chat", safeLoad("./routes/pgChatRoutes"));
app.use("/api/private-chat", safeLoad("./routes/privateChatRoutes"));
app.use("/api/announcements", safeLoad("./routes/announcementRoutes"));
app.use("/api/reviews", safeLoad("./routes/reviewRoutes"));
app.use("/api/notifications", safeLoad("./routes/notificationRoutes"));

/* ================= OWNER ROUTES ================= */

console.log("\n👤 Loading Owner Routes...");

app.use("/api/owner", safeLoad("./routes/ownerPaymentRoutes"));
app.use("/api/owner", safeLoad("./routes/ownerBankRoutes"));
app.use("/api/owner", safeLoad("./routes/ownerVerificationRoutes"));
app.use("/api/owner", safeLoad("./routes/ownerBookingRoutes"));

app.get("/api/owner/test", (req, res) => {

  res.json({
    success: true,
    message: "Owner test endpoint working"
  });

});

/* ================= ADMIN ROUTES ================= */

console.log("\n👑 Loading Admin Routes...");

app.use("/api/admin", safeLoad("./routes/adminRoutes"));

app.use(
  "/api/admin/settlements",
  safeLoad("./routes/adminSettlementRoutes")
);

app.use("/api/admin", safeLoad("./routes/adminServiceRoutes"));

/* ================= VENDOR ROUTES ================= */

console.log("\n🏪 Loading Vendor Routes...");

app.use("/api/vendor", safeLoad("./routes/vendorRoutes"));

/* ================= 404 HANDLER ================= */

app.use((req, res) => {

  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });

});

/* ================= ERROR HANDLER ================= */

app.use((err, req, res, next) => {

  console.error("🔥 GLOBAL ERROR:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });

});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 5000;

if (require.main === module) {

  app.listen(PORT, () => {

    console.log("🚀 Server running on port", PORT);

  });

}

module.exports = app;