const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/paymentController");
const verifyFirebaseToken = require("../middlewares/auth");

//////////////////////////////////////////////////////
// TENANT PAYMENT (GENERATE UPI QR)
//////////////////////////////////////////////////////

router.post(
  "/create",
  verifyFirebaseToken,
  paymentController.createPayment
);

//////////////////////////////////////////////////////
// USER SUBMIT UTR AFTER PAYMENT
//////////////////////////////////////////////////////

router.post(
  "/submit-utr",
  verifyFirebaseToken,
  paymentController.submitUTR
);

//////////////////////////////////////////////////////
// ADMIN ROUTES
//////////////////////////////////////////////////////

// Get all submitted payments
router.get(
  "/admin/payments",
  verifyFirebaseToken,
  paymentController.getSubmittedPayments
);

// Verify payment
router.put(
  "/admin/payments/:orderId/verify",
  verifyFirebaseToken,
  paymentController.verifyPayment
);

// Reject payment
router.put(
  "/admin/payments/:orderId/reject",
  verifyFirebaseToken,
  paymentController.rejectPayment
);

//////////////////////////////////////////////////////
// OWNER SETTLEMENT ROUTES
//////////////////////////////////////////////////////

// Get pending settlements
router.get(
  "/admin/pending-settlements",
  verifyFirebaseToken,
  paymentController.getPendingSettlements
);

// Mark owner settlement done
router.put(
  "/admin/settlements/:bookingId",
  verifyFirebaseToken,
  paymentController.markAsSettled
);

//////////////////////////////////////////////////////
// FINANCE DASHBOARD
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

//////////////////////////////////////////////////////

module.exports = router;