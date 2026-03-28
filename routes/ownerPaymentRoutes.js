const express = require("express");
const router = express.Router();

const { 
  getOwnerPayments, 
  getOwnerSettlementSummary  // Add this
} = require("../controllers/ownerPaymentController");
const auth = require("../middlewares/auth");

// Get all payments for owner
router.get("/payments", auth, getOwnerPayments);

// Get settlement summary
router.get("/settlements/summary", auth, getOwnerSettlementSummary);

// Test endpoint to verify routes
router.get("/test", auth, (req, res) => {
  res.json({ 
    success: true, 
    message: "Owner payment routes working",
    user: req.user 
  });
});

module.exports = router;