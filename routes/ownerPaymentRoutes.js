const express = require("express");
const router = express.Router();

const { 
  getOwnerPayments, 
  getOwnerSettlementSummary,
  signOwnerAgreement // Import the new function
} = require("../controllers/ownerPaymentController");
const auth = require("../middlewares/auth");

// GET endpoints
router.get("/payments", auth, getOwnerPayments);
router.get("/settlements/summary", auth, getOwnerSettlementSummary);

// POST endpoints
router.post("/sign-agreement", auth, signOwnerAgreement); // Add this line

module.exports = router;