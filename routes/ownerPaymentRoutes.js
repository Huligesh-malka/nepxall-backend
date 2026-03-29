// routes/ownerPayments.js

const express = require("express");
const router = express.Router();

const {
  getOwnerPayments,
  getOwnerSettlementSummary,
  signOwnerAgreement,
  markAgreementViewed
} = require("../controllers/ownerPaymentController");

const auth = require("../middlewares/auth");

/* ================= ROUTES ================= */
router.get("/payments", auth, getOwnerPayments);
router.get("/settlements/summary", auth, getOwnerSettlementSummary);

router.post("/agreements/viewed", auth, markAgreementViewed); // ✅ NEW
router.post("/agreements/sign", auth, signOwnerAgreement);

module.exports = router;