const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/paymentController");
const verifyFirebaseToken = require("../middlewares/auth");

//////////////////////////////////////////////////////
// TENANT PAYMENT (UPI QR GENERATION)
//////////////////////////////////////////////////////

router.post(
  "/create-payment",
  verifyFirebaseToken,
  paymentController.createPayment
);

//////////////////////////////////////////////////////
// USER SUBMIT UTR
//////////////////////////////////////////////////////

router.post(
  "/submit-utr",
  verifyFirebaseToken,
  paymentController.submitUTR
);

//////////////////////////////////////////////////////
// ADMIN – GET USER PAYMENTS FOR VERIFICATION
//////////////////////////////////////////////////////

router.get(
  "/admin/payments",
  verifyFirebaseToken,
  paymentController.getSubmittedPayments
);

//////////////////////////////////////////////////////
// ADMIN – VERIFY PAYMENT
//////////////////////////////////////////////////////

router.put(
  "/admin/payments/:orderId/verify",
  verifyFirebaseToken,
  paymentController.verifyPayment
);

//////////////////////////////////////////////////////
// ADMIN – REJECT PAYMENT
//////////////////////////////////////////////////////

router.put(
  "/admin/payments/:orderId/reject",
  verifyFirebaseToken,
  paymentController.rejectPayment
);

//////////////////////////////////////////////////////
// ADMIN – OWNER SETTLEMENTS
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
// ADMIN – FINANCE DASHBOARD
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

// Make sure to export the router
module.exports = router;