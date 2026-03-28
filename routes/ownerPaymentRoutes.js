const express = require("express");
const router = express.Router();

const { 
  getOwnerPayments, 
  getOwnerSettlementSummary 
} = require("../controllers/ownerPaymentController");
const auth = require("../middlewares/auth");

// GET /api/owner/payments
router.get("/payments", auth, getOwnerPayments);

// GET /api/owner/settlements/summary
router.get("/settlements/summary", auth, getOwnerSettlementSummary);

// Test endpoint
router.get("/test", auth, (req, res) => {
  res.json({ 
    success: true, 
    message: "Owner payment routes working",
    user: req.user 
  });
});

module.exports = router;