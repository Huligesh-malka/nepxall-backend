const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/paymentController");
const webhookController = require("../controllers/paymentWebhookController");


const verifyFirebaseToken = require("../middlewares/auth");

//////////////////////////////////////////////////////
// TENANT PAYMENT (UPI SYSTEM)
//////////////////////////////////////////////////////

// 🔹 Generate UPI payment link + QR
router.post(
  "/create-payment",
  verifyFirebaseToken,
  paymentController.createPayment
);

// 🔹 User submits UTR after payment
router.post(
  "/submit-utr",
  verifyFirebaseToken,
  paymentController.submitUTR
);






router.post("/webhook", webhookController.paymentWebhook);

//////////////////////////////////////////////////////
// ADMIN – VERIFY PAYMENT
//////////////////////////////////////////////////////

// 🔹 Admin verifies payment manually
router.put(
  "/admin/verify-payment/:orderId",
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

//////////////////////////////////////////////////////
// ADMIN – FINANCE
//////////////////////////////////////////////////////

// 🔹 Finance summary
router.get(
  "/admin/finance-summary",
  verifyFirebaseToken,
  paymentController.getFinanceSummary
);

// 🔹 Settlement history
router.get(
  "/admin/settlement-history",
  verifyFirebaseToken,
  paymentController.getSettlementHistory
);

module.exports = router;