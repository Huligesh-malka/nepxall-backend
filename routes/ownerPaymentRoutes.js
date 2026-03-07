const express = require("express");
const router = express.Router();
const { 
  getOwnerPayments, 
  debugOwnerPayments 
} = require("../controllers/ownerPaymentController");
const auth = require("../middlewares/auth");

// Debug middleware for this router
router.use((req, res, next) => {
  console.log(`🔵 [OWNER PAYMENTS] ${req.method} ${req.originalUrl}`);
  console.log(`🔑 Auth header:`, req.headers.authorization ? "✅ Present" : "❌ Missing");
  if (req.headers.authorization) {
    console.log(`🔑 Token preview: ${req.headers.authorization.substring(0, 30)}...`);
  }
  next();
});

// Test endpoint (no auth required) - useful for checking if route is mounted
router.get("/payments-test", (req, res) => {
  console.log("✅ Payments test endpoint hit");
  res.json({ 
    success: true, 
    message: "✅ Owner payments route is working correctly",
    timestamp: new Date().toISOString(),
    endpoints: {
      test: "/api/owner/payments-test",
      debug: "/api/owner/payments/debug",
      main: "/api/owner/payments"
    }
  });
});

// Public test endpoint without auth
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Owner payments router is mounted",
    routes: [
      "GET /api/owner/payments-test",
      "GET /api/owner/payments/debug (auth required)",
      "GET /api/owner/payments (auth required)"
    ]
  });
});

// Debug endpoint (with auth)
router.get("/payments/debug", auth, debugOwnerPayments);

// Main payments endpoint (with auth)
router.get("/payments", auth, getOwnerPayments);

module.exports = router;