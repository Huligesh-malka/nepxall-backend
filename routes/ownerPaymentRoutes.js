const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const {
  getOwnerPayments,
  getOwnerSettlementSummary,
  signOwnerAgreement
} = require("../controllers/ownerPaymentController");

router.get("/payments", auth, getOwnerPayments);
router.get("/settlements/summary", auth, getOwnerSettlementSummary);
router.post("/agreements/sign", auth, signOwnerAgreement); // Updated endpoint path

module.exports = router;