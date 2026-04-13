const express = require("express");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");

const {
  createPlanPayment,
  verifyPlanPayment,
  getPlanPayments
} = require("../controllers/planPaymentController");

/* ================= PLAN PAYMENT ================= */

router.post("/create", auth, createPlanPayment);

/* ================= ADMIN (TEMP WITHOUT AUTH) ================= */

// ⚠️ No adminAuth for now
router.get("/admin", auth, getPlanPayments);
router.post("/verify/:orderId", auth, verifyPlanPayment);

module.exports = router;