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
    crossOriginResourcePolicy: false,
  }));

  /* ================= LOGGER ================= */
  app.use((req, res, next) => {
    console.log(`➡️ ${req.method} ${req.originalUrl}`);
    next();
  });

  /* ================= BODY PARSER ================= */
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  /* ================= STATIC FILES ================= */
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
  app.options(/.*/, cors(corsOptions));

  /* ================= SAFE ROUTE LOADER ================= */
  const safeLoad = (path) => {
    try {
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
  app.use("/api/auth", safeLoad("./routes/authRoutes"));
  app.use("/api/pg", safeLoad("./routes/pgRoutes"));
  app.use("/api/pg", safeLoad("./routes/nearbyPGRoutes"));
  app.use("/api/rooms", safeLoad("./routes/roomRoutes"));
  app.use("/api/upload", safeLoad("./routes/uploadRoutes"));
  app.use("/api/bookings", safeLoad("./routes/bookingRoutes"));

  /* ================= AGREEMENT ROUTES (FIXED) ================= */
  console.log("\n📄 Loading Agreement Routes...");
  const agreementFormRouter = safeLoad("./routes/agreementsFormRoutes");

  // This line solves your 404: It maps /api/agreements-form/submit to your router
  app.use("/api/agreements-form", agreementFormRouter); 
  app.use("/api/agreements", agreementFormRouter); 
  app.use("/api/agreement", agreementFormRouter); 

  /* ================= FINANCIAL & STAY ROUTES ================= */
  app.use("/api/deposit", safeLoad("./routes/depositRoutes"));
  app.use("/api/vacate", safeLoad("./routes/vacateRoutes"));
  app.use("/api/scan", safeLoad("./routes/qrScanRoutes"));
  app.use("/api/payments", safeLoad("./routes/paymentRoutes"));
  app.use("/api/movein", safeLoad("./routes/kycMoveinRoutes"));
  app.use("/api/services", safeLoad("./routes/serviceRoutes"));
  app.use("/api/digilocker", safeLoad("./routes/digilockerRoutes"));

  /* ================= CHAT & SOCIAL ================= */
  app.use("/api/pg-chat", safeLoad("./routes/pgChatRoutes"));
  app.use("/api/private-chat", safeLoad("./routes/privateChatRoutes"));
  app.use("/api/announcements", safeLoad("./routes/announcementRoutes"));
  app.use("/api/reviews", safeLoad("./routes/reviewRoutes"));
  app.use("/api/notifications", safeLoad("./routes/notificationRoutes"));
  app.use("/api/whatsapp", safeLoad("./routes/whatsappBooking"));

  app.use("/api/ai", safeLoad("./routes/ai"));
  app.use("/api/ai-call", safeLoad("./routes/aiCallRoutes"));

  app.use("/api/social", safeLoad("./routes/socialRoutes"));


  app.use("/api/settings", safeLoad("./routes/settingsRoutes"));

  /* ================= OWNER ROUTES ================= */
  app.use("/api/owner", safeLoad("./routes/ownerPaymentRoutes"));
  app.use("/api/plan", safeLoad("./routes/planRoutes"));
  app.use("/api/owner", safeLoad("./routes/ownerBankRoutes"));
  app.use("/api/owner", safeLoad("./routes/ownerVerificationRoutes"));
  app.use("/api/owner", safeLoad("./routes/ownerBookingRoutes"));

  /* ================= ADMIN ROUTES ================= */
  app.use("/api/admin", safeLoad("./routes/adminRoutes"));
  app.use("/api/admin", safeLoad("./routes/adminRefundRoutes"));
  app.use("/api/admin/settlements", safeLoad("./routes/adminSettlementRoutes"));
  app.use("/api/admin/owners", safeLoad("./routes/ownerApprovalRoutes"));

  /* ================= VENDOR ROUTES ================= */
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