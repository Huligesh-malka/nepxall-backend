const express = require("express");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");

const {
  createPlanPayment,
  autoVerifyPlanPayment,   // 🔥 NEW
  getPlanPayments
} = require("../controllers/planPaymentController");

/* =========================================================
   💰 PLAN PAYMENT
========================================================= */

// Create QR
router.post("/create", auth, createPlanPayment);


/* =========================================================
   🚀 AUTO VERIFY (NO ADMIN)
========================================================= */

// User clicks "I Paid"
router.post("/auto-verify", auth, autoVerifyPlanPayment);


/* =========================================================
   📊 VIEW PAYMENTS (OPTIONAL)
========================================================= */

// For testing / dashboard
router.get("/admin", auth, getPlanPayments);


module.exports = router;