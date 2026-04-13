const express = require("express");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");

const {
  createPlanPayment,
  verifyPlanPayment,   // ✅ USE THIS
  getPlanPayments
} = require("../controllers/planPaymentController");

/* =========================================================
   💰 PLAN PAYMENT
========================================================= */

// Create QR
router.post("/create", auth, createPlanPayment);


/* =========================================================
   👨‍💼 ADMIN VERIFY (MANUAL)
========================================================= */

// Get all payments
router.get("/admin", auth, getPlanPayments);

// Approve payment
router.post("/verify/:orderId", auth, verifyPlanPayment);


module.exports = router;