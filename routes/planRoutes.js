const express = require("express");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");

const {
  createCashfreePlanOrder,
  verifyCashfreePlanPayment,
  getPlanPayments
} = require("../controllers/planPaymentController");

/* =========================================================
   💳 CASHFREE PLAN PAYMENT
========================================================= */

// Create Cashfree Order
router.post(
  "/create-cashfree-order",
  auth,
  createCashfreePlanOrder
);

// Verify Payment Automatically
router.get(
  "/verify/:orderId",
  auth,
  verifyCashfreePlanPayment
);

/* =========================================================
   👨‍💼 ADMIN
========================================================= */

// View Payments
router.get(
  "/admin",
  auth,
  getPlanPayments
);

module.exports = router;