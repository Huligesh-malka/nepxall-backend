const express = require("express");
const router = express.Router();
const { 
  getOwnerPayments, 
  getOwnerPaymentDetails,
  getOwnerSettlementSummary 
} = require("../controllers/ownerPaymentController");
const auth = require("../middlewares/auth");

// Get all verified payments for owner
router.get("/payments", auth, getOwnerPayments);

// Get specific payment details (only if verified)
router.get("/payments/:bookingId", auth, getOwnerPaymentDetails);

// Get settlement summary for dashboard
router.get("/settlements/summary", auth, getOwnerSettlementSummary);

module.exports = router;