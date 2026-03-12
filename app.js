const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();

/* ================= TRUST PROXY ================= */
app.set("trust proxy", 1);

/* ================= SECURITY ================= */
app.use(helmet({
  crossOriginResourcePolicy: false, // Allows images to be loaded from other domains
}));

/* ================= LOGGER ================= */
app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.originalUrl}`);
  next();
});

/* ================= BODY PARSER ================= */
// Increased limits to handle multi-file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/* ================= CORS CONFIGURATION ================= */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://nepxall.vercel.app",
  "https://nepxall-app.vercel.app", // Added based on your screenshot
  "https://nepxall-frontend.vercel.app",
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.some(domain => origin.startsWith(domain)) || origin.includes("vercel.app");
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log("❌ Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
// Handle preflight requests for all routes
app.options("*", cors(corsOptions));

/* ================= SAFE ROUTE LOADER ================= */
const safeLoad = (path) => {
  try {
    const route = require(path);
    return route;
  } catch (err) {
    console.error("❌ Failed to load:", path, err.message);
    const dummyRouter = express.Router();
    dummyRouter.use((req, res) => {
      res.status(500).json({ success: false, message: "Route not configured" });
    });
    return dummyRouter;
  }
};

/* ================= ROUTES ================= */
app.get("/", (req, res) => res.json({ success: true, message: "🚀 Nepxall Backend API Running" }));
app.get("/api/health", (req, res) => res.json({ success: true, status: "healthy" }));

// Core Routes
app.use("/api/auth", safeLoad("./routes/authRoutes"));
app.use("/api/pg", safeLoad("./routes/pgRoutes"));
app.use("/api/bookings", safeLoad("./routes/bookingRoutes"));
app.use("/api/agreements-form", safeLoad("./routes/agreementsFormRoutes")); // The form you are working on
app.use("/api/payments", safeLoad("./routes/paymentRoutes"));
app.use("/api/kyc-movein", safeLoad("./routes/kycMoveinRoutes"));

/* Add all your other app.use routes here following the pattern above... */

/* ================= ERROR HANDLER ================= */
app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => console.log("🚀 Server running on port", PORT));
}

module.exports = app;