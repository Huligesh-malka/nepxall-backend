const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/paymentController");
const webhookController = require("../controllers/paymentWebhookController");

const verifyFirebaseToken = require("../middlewares/auth");

//////////////////////////////////////////////////////
// TENANT PAYMENT (UPI SYSTEM)
//////////////////////////////////////////////////////

// Generate UPI QR
router.post(
  "/create-payment",
  verifyFirebaseToken,
  paymentController.createPayment
);

//////////////////////////////////////////////////////
// USER PAYMENT CONFIRMATION
//////////////////////////////////////////////////////

// User clicks "I Have Paid"
router.post(
  "/confirm-payment",
  verifyFirebaseToken,
  paymentController.confirmPayment
);

//////////////////////////////////////////////////////
// BANK AUTO MATCH
//////////////////////////////////////////////////////

router.post(
  "/match-bank-transaction",
  verifyFirebaseToken,
  paymentController.matchBankTransaction
);

//////////////////////////////////////////////////////
// WEBHOOK (future gateway)
//////////////////////////////////////////////////////

router.post(
  "/webhook",
  webhookController.paymentWebhook
);

//////////////////////////////////////////////////////
// ADMIN VERIFY PAYMENT
//////////////////////////////////////////////////////

router.put(
  "/admin/verify-payment/:orderId",
  verifyFirebaseToken,
  paymentController.verifyPayment
);

//////////////////////////////////////////////////////
// ADMIN SETTLEMENT
//////////////////////////////////////////////////////

router.get(
  "/admin/pending-settlements",
  verifyFirebaseToken,
  paymentController.getPendingSettlements
);

router.put(
  "/admin/mark-settled/:bookingId",
  verifyFirebaseToken,
  paymentController.markAsSettled
);

//////////////////////////////////////////////////////
// ADMIN FINANCE
//////////////////////////////////////////////////////

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