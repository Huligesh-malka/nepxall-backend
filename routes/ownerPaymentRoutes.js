const express = require("express");
const router = express.Router();

const { getOwnerPayments } = require("../controllers/ownerPaymentController");
const auth = require("../middlewares/auth");

router.get("/payments", auth, getOwnerPayments);

module.exports = router;