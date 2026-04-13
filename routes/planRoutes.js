const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const adminAuth = require("../middlewares/adminAuth");


const {
  createPlanPayment,
  verifyPlanPayment,
  getPlanPayments
} = require("../controllers/planPaymentController");

/* =========================================================
   💰 PLAN PAYMENT ROUTES
   BASE → /api/plan
========================================================= */

/* =========================================================
   📤 CREATE PAYMENT (QR)
   POST /api/plan/create
   (OWNER ONLY)
========================================================= */
router.post("/create", auth, createPlanPayment);

/* =========================================================
   👨‍💼 ADMIN ROUTES
========================================================= */

/* =========================================================
   📊 GET ALL PLAN PAYMENTS
========================================================= */
router.get("/admin", adminAuth, getPlanPayments);

/* =========================================================
   ✅ VERIFY PAYMENT
========================================================= */
router.post("/verify/:orderId", adminAuth, verifyPlanPayment);

module.exports = router;