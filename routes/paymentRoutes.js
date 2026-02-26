const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const verifyFirebaseToken = require("../middlewares/auth");

//////////////////////////////////////////////////////
// TENANT PAYMENT
//////////////////////////////////////////////////////

// 🔹 Create Cashfree order
router.post(
  "/create-order",
  verifyFirebaseToken,
  paymentController.createOrder
);

// 🔹 Verify payment after redirect
router.get(
  "/verify-payment/:orderId",
  verifyFirebaseToken,
  paymentController.verifyPayment
);

//////////////////////////////////////////////////////
// ADMIN – SETTLEMENT
//////////////////////////////////////////////////////

// 🔹 Get all pending settlements
router.get(
  "/admin/pending-settlements",
  verifyFirebaseToken,
  paymentController.getPendingSettlements
);

// 🔹 Mark settlement as completed
router.put(
  "/admin/mark-settled/:bookingId",
  verifyFirebaseToken,
  paymentController.markAsSettled
);




router.get(
  "/admin/finance-summary",
  verifyFirebaseToken,
  paymentController.getFinanceSummary
);

router.get(
  "/admin/settlement-history",
  verifyFirebaseToken,
  paymentController.getSettlementHistory
);

module.exports = router;