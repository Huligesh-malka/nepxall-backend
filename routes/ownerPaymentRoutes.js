const express = require("express");
const router = express.Router();

const firebaseAuth = require("../middlewares/auth");
const { getOwnerPayments } = require("../controllers/ownerPaymentController");

router.get("/payments", firebaseAuth, getOwnerPayments);

module.exports = router;