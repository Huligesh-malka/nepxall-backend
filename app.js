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

/* ================= BODY PARSER ================= */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/* ================= CORS ================= */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || origin.includes("vercel.app") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log("❌ Blocked by CORS:", origin);
    return callback(null, true); // change to false for strict production
  },
  credentials: true
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

/* ================= SAFE ROUTE LOADER ================= */
const safeLoad = (path) => {
  try {
    const route = require(path);
    console.log("✅ Loaded:", path);
    return route;
  } catch (err) {
    console.error("❌ Failed to load:", path, err.message);
    return express.Router();
  }
};

/* ================= ROOT ROUTES ================= */

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🚀 Nepxall Backend API Running"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy"
  });
});

/* ================= CORE ROUTES ================= */

app.use("/api/auth", safeLoad("./routes/authRoutes"));
app.use("/api/pg", safeLoad("./routes/pgRoutes"));
app.use("/api/rooms", safeLoad("./routes/roomRoutes"));
app.use("/api/upload", safeLoad("./routes/uploadRoutes"));
app.use("/api/bookings", safeLoad("./routes/bookingRoutes"));
app.use("/api/agreement", safeLoad("./routes/agreementRoutes"));
app.use("/api/deposit", safeLoad("./routes/depositRoutes"));
app.use("/api/vacate", safeLoad("./routes/vacateRoutes"));

/* ================= PAYMENT ROUTES (UPI SYSTEM) ================= */

app.use("/api/payments", safeLoad("./routes/paymentRoutes"));

/* ================= MOVE-IN / KYC ================= */

app.use("/api/movein", safeLoad("./routes/kycMoveinRoutes"));

/* ================= SERVICES ================= */

app.use("/api/services", safeLoad("./routes/serviceRoutes"));

/* ================= CHAT & SOCIAL ================= */

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
app.use("/api/admin/settlements", safeLoad("./routes/adminSettlementRoutes"));
app.use("/api/admin", safeLoad("./routes/adminServiceRoutes"));

/* ================= VENDOR ================= */

app.use("/api/vendor", safeLoad("./routes/vendorRoutes"));

/* ================= 404 HANDLER ================= */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `❌ Route ${req.originalUrl} not found`
  });
});

/* ================= GLOBAL ERROR HANDLER ================= */

app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

module.exports = app;