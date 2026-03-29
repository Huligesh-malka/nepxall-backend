// routes/ownerPayments.js

const express = require("express");
const router = express.Router();

const {
  getOwnerPayments,
  getOwnerSettlementSummary,
  signOwnerAgreement
} = require("../controllers/ownerPaymentController");

const auth = require("../middlewares/auth");

/* ================= PAYMENTS ================= */
router.get("/payments", auth, getOwnerPayments);

/* ================= SUMMARY ================= */
router.get("/settlements/summary", auth, getOwnerSettlementSummary);

/* ================= SIGN ================= */
router.post("/agreements/sign", auth, signOwnerAgreement);

module.exports = router;