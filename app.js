const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
require("dotenv").config();

const app = express();

/* ================= TRUST PROXY ================= */
app.set("trust proxy", 1);

/* ================= SECURITY ================= */
app.use(helmet({
  crossOriginResourcePolicy: false, // Allows images to be loaded by frontend
}));

/* ================= LOGGER ================= */
app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.originalUrl}`);
  next();
});

/* ================= BODY PARSER ================= */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/* ================= STATIC FILES (For Signatures/Uploads) ================= */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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
app.options("*", cors(corsOptions));

/* ================= SAFE ROUTE LOADER ================= */
const safeLoad = (routePath) => {
  try {
    const route = require(routePath);
    console.log("✅ Successfully loaded:", routePath);
    return route;
  } catch (err) {
    console.error("❌ Failed to load:", routePath, err.message);
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

/* ================= ROOT & HEALTH ================= */
app.get("/", (req, res) => res.json({ success: true, message: "🚀 Nepxall Backend API Running" }));
app.get("/api/health", (req, res) => res.json({ success: true, status: "healthy" }));

/* ================= CORE ROUTES ================= */
app.use("/api/auth", safeLoad("./routes/authRoutes"));
app.use("/api/pg", safeLoad("./routes/pgRoutes"));
app.use("/api/rooms", safeLoad("./routes/roomRoutes"));
app.use("/api/upload", safeLoad("./routes/uploadRoutes"));
app.use("/api/bookings", safeLoad("./routes/bookingRoutes"));

/* ================= AGREEMENTS (FIXED SECTION) ================= */
console.log("\n📄 Mapping Agreement Routes...");
// We map the actual logic to /api/agreements so frontend admin calls work
const agreementLogic = safeLoad("./routes/agreementsFormRoutes");
app.use("/api/agreements", agreementLogic); 

app.use("/api/deposit", safeLoad("./routes/depositRoutes"));
app.use("/api/vacate", safeLoad("./routes/vacateRoutes"));

/* ================= OTHER ROUTES ================= */
app.use("/api/scan", safeLoad("./routes/qrScanRoutes"));
app.use("/api/payments", safeLoad("./routes/paymentRoutes"));
app.use("/api/movein", safeLoad("./routes/kycMoveinRoutes"));
app.use("/api/services", safeLoad("./routes/serviceRoutes"));
app.use("/api/digilocker", safeLoad("./routes/digilockerRoutes"));
app.use("/api/pg-chat", safeLoad("./routes/pgChatRoutes"));
app.use("/api/announcements", safeLoad("./routes/announcementRoutes"));

/* ================= ADMIN & OWNER ================= */
app.use("/api/owner", safeLoad("./routes/ownerBookingRoutes"));
app.use("/api/admin", safeLoad("./routes/adminRoutes"));

/* ================= 404 & ERROR HANDLING ================= */
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

app.use((err, req, res, next) => {
  console.error("🔥 ERROR:", err);
  res.status(500).json({ success: false, message: "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => console.log("🚀 Server running on port", PORT));
}

module.exports = app;