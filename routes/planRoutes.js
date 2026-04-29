const express = require("express");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");
const isAdmin = require("../middlewares/isAdminMiddleware"); // You'll need to create this if not exists

const {
  createCashfreePlanOrder,      // ✅ NEW Cashfree order creation
  verifyCashfreePlanPayment,    // ✅ NEW Cashfree auto verification
  getPlanPayments               // ✅ Keep for admin
} = require("../controllers/planPaymentController");

/* =========================================================
   💰 PLAN PAYMENT - CASHFREE AUTOMATIC
========================================================= */

// Create Cashfree order
router.post("/create-cashfree-order", auth, createCashfreePlanOrder);

// Verify payment status (called from success page)
router.get("/verify/:orderId", auth, verifyCashfreePlanPayment);

/* =========================================================
   👨‍💼 ADMIN - VIEW PAYMENTS
========================================================= */

// Get all payments (admin only)
router.get("/admin", auth, isAdmin, getPlanPayments);

module.exports = router;