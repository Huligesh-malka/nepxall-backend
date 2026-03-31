const express = require("express");
const router = express.Router();
const {
  getOwnerPayments,
  getOwnerSettlementSummary,
  signOwnerAgreement,
  markAgreementViewed
} = require("../controllers/ownerPaymentController");

const auth = require("../middlewares/authMiddleware");

// Protected Routes (Still need login)
router.get("/payments", auth, getOwnerPayments);
router.get("/settlements/summary", auth, getOwnerSettlementSummary);
router.post("/agreements/viewed", auth, markAgreementViewed);

// PUBLIC Route: No 'auth' middleware. Just enter number + OTP and sign.
router.post("/agreements/sign", signOwnerAgreement);

module.exports = router;