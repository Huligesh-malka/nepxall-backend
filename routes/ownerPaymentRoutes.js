const express = require("express");
const router = express.Router();
const { 
  getOwnerPayments, 
  debugOwnerPayments 
} = require("../controllers/ownerPaymentController");
const auth = require("../middlewares/auth");

router.get("/payments", auth, getOwnerPayments);
router.get("/payments/debug", auth, debugOwnerPayments); // Temporary debug endpoint

module.exports = router;