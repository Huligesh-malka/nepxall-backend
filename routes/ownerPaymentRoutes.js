const express = require("express");
const router = express.Router();

const {
  getOwnerPayments,
  getOwnerSettlementSummary,
  signOwnerAgreement,
  markAgreementViewed
} = require("../controllers/ownerPaymentController");

const auth = require("../middlewares/authMiddleware");

/* ================= OWNER ROUTES ================= */

// Payments list
router.get("/payments", auth, getOwnerPayments);

// Summary
router.get("/settlements/summary", auth, getOwnerSettlementSummary);

// Mark PDF viewed
router.post("/agreements/viewed", auth, markAgreementViewed);

// Sign agreement
router.post("/agreements/sign", auth, signOwnerAgreement);

module.exports = router;