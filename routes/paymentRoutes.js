const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/paymentController");
const webhookController = require("../controllers/paymentWebhookController");

const verifyFirebaseToken = require("../middlewares/auth");

//////////////////////////////////////////////////////
// TENANT PAYMENT (UPI SYSTEM)
//////////////////////////////////////////////////////

// 🔹 Generate UPI payment QR
router.post(
  "/create-payment",
  verifyFirebaseToken,
  paymentController.createPayment
);

//////////////////////////////////////////////////////
// USER PAYMENT CONFIRMATION
//////////////////////////////////////////////////////

// 🔹 User clicks "I Have Paid"
router.post(
  "/confirm-payment",
  verifyFirebaseToken,
  paymentController.confirmPayment
);

// 🔹 Optional: user submits UTR (backup system)
router.post(
  "/submit-utr",
  verifyFirebaseToken,
  paymentController.submitUTR
);

//////////////////////////////////////////////////////
// BANK / AUTO MATCH SYSTEM
//////////////////////////////////////////////////////

// 🔹 Match bank remark with orderId
router.post(
  "/match-bank-transaction",
  verifyFirebaseToken,
  paymentController.matchBankTransaction
);

//////////////////////////////////////////////////////
// WEBHOOK (future payment gateway)
//////////////////////////////////////////////////////

router.post(
  "/webhook",
  webhookController.paymentWebhook
);

//////////////////////////////////////////////////////
// ADMIN – VERIFY PAYMENT
//////////////////////////////////////////////////////

router.put(
  "/admin/verify-payment/:orderId",
  verifyFirebaseToken,
  paymentController.verifyPayment
);

//////////////////////////////////////////////////////
// ADMIN – SETTLEMENT
//////////////////////////////////////////////////////

// 🔹 Pending owner settlements
router.get(
  "/admin/pending-settlements",
  verifyFirebaseToken,
  paymentController.getPendingSettlements
);

// 🔹 Mark settlement complete
router.put(
  "/admin/mark-settled/:bookingId",
  verifyFirebaseToken,
  paymentController.markAsSettled
);

//////////////////////////////////////////////////////
// ADMIN – FINANCE
//////////////////////////////////////////////////////

// 🔹 Finance dashboard
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