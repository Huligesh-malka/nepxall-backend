const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

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

/* ================= BODY PARSER ================= */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/* ================= CORS ================= */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://nepxall.vercel.app",
  "https://nepxall-frontend.vercel.app",
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || origin.includes("vercel.app") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.log("❌ Blocked by CORS:", origin);
    return callback(null, true);
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

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

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🚀 Nepxall Backend API Running"
  });
});

/* ================= ✅ HEALTH (IMPORTANT FIX) ================= */
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    message: "Backend is running"
  });
});

/* ================= CORE ================= */
app.use("/api/auth", safeLoad("./routes/authRoutes"));
app.use("/api/pg", safeLoad("./routes/pgRoutes"));
app.use("/api/rooms", safeLoad("./routes/roomRoutes"));
app.use("/api/upload", safeLoad("./routes/uploadRoutes"));
app.use("/api/bookings", safeLoad("./routes/bookingRoutes"));

/* ================= AGREEMENTS ================= */
console.log("\n📄 Loading Agreement Routes...");

app.use("/api/agreements", safeLoad("./routes/agreementRoutes"));
app.use("/api/agreements-form", safeLoad("./routes/agreementsFormRoutes"));

app.use("/api/deposit", safeLoad("./routes/depositRoutes"));
app.use("/api/vacate", safeLoad("./routes/vacateRoutes"));

/* ================= OTHER ROUTES ================= */
app.use("/api/scan", safeLoad("./routes/qrScanRoutes"));
app.use("/api/payments", safeLoad("./routes/paymentRoutes"));
app.use("/api/movein", safeLoad("./routes/kycMoveinRoutes"));
app.use("/api/services", safeLoad("./routes/serviceRoutes"));
app.use("/api/digilocker", safeLoad("./routes/digilockerRoutes"));

app.use("/api/pg-chat", safeLoad("./routes/pgChatRoutes"));
app.use("/api/private-chat", safeLoad("./routes/privateChatRoutes"));
app.use("/api/announcements", safeLoad("./routes/announcementRoutes"));
app.use("/api/reviews", safeLoad("./routes/reviewRoutes"));
app.use("/api/notifications", safeLoad("./routes/notificationRoutes"));

/* ================= OWNER ================= */
app.use("/api/owner", safeLoad("./routes/ownerPaymentRoutes"));
app.use("/api/owner", safeLoad("./routes/ownerBankRoutes"));
app.use("/api/owner", safeLoad("./routes/ownerVerificationRoutes"));
app.use("/api/owner", safeLoad("./routes/ownerBookingRoutes"));

/* ================= ADMIN ================= */
app.use("/api/admin", safeLoad("./routes/adminRoutes"));
app.use("/api/admin/settlements", safeLoad("./routes/adminSettlementRoutes"));
app.use("/api/admin", safeLoad("./routes/adminServiceRoutes"));

/* ================= VENDOR ================= */
app.use("/api/vendor", safeLoad("./routes/vendorRoutes"));

/* ================= 404 ================= */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

/* ================= ERROR ================= */
app.use((err, req, res, next) => {
  console.error("🔥 ERROR:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

/* ================= START ================= */
const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log("🚀 Server running on port", PORT);
  });
}

module.exports = app;