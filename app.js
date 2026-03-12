const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();

/* ================= TRUST PROXY ================= */
app.set("trust proxy", 1);

/* ================= SECURITY ================= */
app.use(helmet({
  crossOriginResourcePolicy: false, // Essential for loading Cloudinary images in the frontend
}));

/* ================= LOGGER ================= */
app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.originalUrl}`);
  next();
});

/* ================= BODY PARSER ================= */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/* ================= CORS CONFIGURATION ================= */
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
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or local scripts)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list OR is a vercel.app subdomain
    const isAllowed = allowedOrigins.includes(origin) || origin.endsWith(".vercel.app");
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log("❌ Blocked by CORS:", origin);
      callback(null, false); // Send false instead of error to prevent server crash
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
// Handle preflight requests for all routes explicitly
app.options("*", cors(corsOptions));

/* ================= SAFE ROUTE LOADER ================= */
const safeLoad = (path) => {
  try {
    const route = require(path);
    return route;
  } catch (err) {
    console.error(`❌ Failed to load route at ${path}:`, err.message);
    const dummyRouter = express.Router();
    dummyRouter.use((req, res) => {
      res.status(500).json({ success: false, message: "This feature is temporarily unavailable." });
    });
    return dummyRouter;
  }
};

/* ================= ROUTES ================= */
app.get("/", (req, res) => res.json({ success: true, message: "🚀 Nepxall Backend API Running" }));
app.get("/api/health", (req, res) => res.json({ success: true, status: "healthy" }));

// Feature Routes
app.use("/api/auth", safeLoad("./routes/authRoutes"));
app.use("/api/pg", safeLoad("./routes/pgRoutes"));
app.use("/api/rooms", safeLoad("./routes/roomRoutes"));
app.use("/api/bookings", safeLoad("./routes/bookingRoutes"));
app.use("/api/agreements-form", safeLoad("./routes/agreementsFormRoutes"));
app.use("/api/payments", safeLoad("./routes/paymentRoutes"));
app.use("/api/kyc-movein", safeLoad("./routes/kycMoveinRoutes"));
app.use("/api/services", safeLoad("./routes/serviceRoutes"));
app.use("/api/notifications", safeLoad("./routes/notificationRoutes"));

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
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ Allowed Origins:`, allowedOrigins);
  });
}

module.exports = app;