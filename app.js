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
    // Return a dummy router that logs requests
    const dummyRouter = express.Router();
    dummyRouter.use((req, res) => {
      console.log(`⚠️ Using dummy router for ${req.originalUrl} - route not properly loaded`);
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
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/api/health",
      auth: "/api/auth",
      owner: "/api/owner",
      payments: "/api/owner/payments"
    }
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
app.use("/api/agreement", safeLoad("./routes/agreementRoutes"));
app.use("/api/deposit", safeLoad("./routes/depositRoutes"));
app.use("/api/vacate", safeLoad("./routes/vacateRoutes"));

/* ================= PAYMENT ROUTES (UPI SYSTEM) ================= */

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

// IMPORTANT: Order matters - more specific routes first

// 1. Load Payment Routes FIRST (most specific)
console.log("📊 Loading Owner Payment Routes...");
app.use("/api/owner", safeLoad("./routes/ownerPaymentRoutes"));

// 2. Load Bank Details Routes
console.log("🏦 Loading Owner Bank Routes...");
app.use("/api/owner", safeLoad("./routes/ownerBankRoutes"));

// 3. Load Verification Routes
console.log("✅ Loading Owner Verification Routes...");
app.use("/api/owner", safeLoad("./routes/ownerVerificationRoutes"));

// 4. Load Booking Routes (most general last)
console.log("📅 Loading Owner Booking Routes...");
app.use("/api/owner", safeLoad("./routes/ownerBookingRoutes"));

// Add a catch-all owner route for debugging
app.use("/api/owner/test", (req, res) => {
  res.json({
    success: true,
    message: "Owner test endpoint working",
    availableRoutes: [
      "/api/owner/payments",
      "/api/owner/payments/debug",
      "/api/owner/bookings",
      "/api/owner/bank",
      "/api/owner/verification"
    ]
  });
});

/* ================= ADMIN ROUTES ================= */

console.log("\n👑 Loading Admin Routes...");
app.use("/api/admin", safeLoad("./routes/adminRoutes"));
app.use("/api/admin/settlements", safeLoad("./routes/adminSettlementRoutes"));
app.use("/api/admin", safeLoad("./routes/adminServiceRoutes"));

/* ================= VENDOR ROUTES ================= */

console.log("\n🏪 Loading Vendor Routes...");
app.use("/api/vendor", safeLoad("./routes/vendorRoutes"));

/* ================= DEBUG ENDPOINTS ================= */

// List all registered routes (debug only - remove in production)
if (process.env.NODE_ENV !== 'production') {
  app.get("/api/debug/routes", (req, res) => {
    const routes = [];
    app._router.stack.forEach(middleware => {
      if (middleware.route) {
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods)
        });
      } else if (middleware.name === 'router') {
        middleware.handle.stack.forEach(handler => {
          if (handler.route) {
            routes.push({
              path: handler.route.path,
              methods: Object.keys(handler.route.methods)
            });
          }
        });
      }
    });
    res.json({
      success: true,
      totalRoutes: routes.length,
      routes: routes
    });
  });
}

/* ================= 404 HANDLER ================= */

app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `❌ Route ${req.originalUrl} not found`,
    availablePaths: {
      owner: "/api/owner/payments, /api/owner/bookings, /api/owner/bank",
      health: "/api/health",
      auth: "/api/auth"
    }
  });
});

/* ================= GLOBAL ERROR HANDLER ================= */

app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
  });

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 5000;

// Only start server if not in test environment
if (require.main === module) {
  app.listen(PORT, () => {
    console.log("\n" + "=".repeat(50));
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📝 Test endpoints:`);
    console.log(`   - GET /api/health`);
    console.log(`   - GET /api/owner/test`);
    console.log(`   - GET /api/owner/payments-test (if configured)`);
    console.log(`   - GET /api/debug/routes (development only)`);
    console.log("=".repeat(50) + "\n");
  });
}

module.exports = app;