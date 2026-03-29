// routes/ownerPayments.js

const express = require("express");
const router = express.Router();

const {
  getOwnerPayments,
  getOwnerSettlementSummary,
  signOwnerAgreement
} = require("../controllers/ownerPaymentController");

const auth = require("../middlewares/auth");

router.get("/payments", auth, getOwnerPayments);
router.get("/settlements/summary", auth, getOwnerSettlementSummary);
router.post("/agreements/sign", auth, signOwnerAgreement);

module.exports = router;