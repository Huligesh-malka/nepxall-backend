const express = require("express");
const router = express.Router();

const {
  getOwnerPayments,
  getOwnerSettlementSummary,
  signOwnerAgreement
} = require("../controllers/ownerPaymentController");

const auth = require("../middlewares/auth");

/* ================= OWNER PAYMENTS ================= */
router.get("/payments", auth, getOwnerPayments);

/* ================= OWNER SUMMARY ================= */
router.get("/settlements/summary", auth, getOwnerSettlementSummary);

/* ================= SIGN AGREEMENT ================= */
router.post("/agreements/sign", auth, signOwnerAgreement);

module.exports = router;