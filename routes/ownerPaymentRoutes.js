const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const { getOwnerPayments, signOwnerAgreement } = require("../controllers/ownerPaymentController");

router.get("/payments", auth, getOwnerPayments);
router.post("/agreements/sign", auth, signOwnerAgreement);

module.exports = router;