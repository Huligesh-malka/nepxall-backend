const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/paymentController");
const webhookController = require("../controllers/paymentWebhookController");
const verifyFirebaseToken = require("../middlewares/auth");

//////////////////////////////////////////////////////
// USER PAYMENT
//////////////////////////////////////////////////////

router.post(
  "/create-payment",
  verifyFirebaseToken,
  paymentController.createPayment
);

router.post(
  "/confirm-payment",
  verifyFirebaseToken,
  paymentController.confirmPayment
);

router.post(
  "/match-bank-transaction",
  verifyFirebaseToken,
  paymentController.matchBankTransaction
);

router.post(
  "/webhook",
  webhookController.paymentWebhook
);

//////////////////////////////////////////////////////
// ADMIN PAYMENT PANEL
//////////////////////////////////////////////////////

router.get(
  "/admin/payments",
  verifyFirebaseToken,
  paymentController.getAdminPayments
);

router.put(
  "/admin/payments/:orderId/verify",
  verifyFirebaseToken,
  paymentController.verifyPayment
);

router.put(
  "/admin/payments/:orderId/reject",
  verifyFirebaseToken,
  paymentController.rejectPayment
);




// Add these routes
router.post("/submit-screenshot", upload.single("screenshot"), paymentController.submitPaymentWithScreenshot);
router.get("/status/:bookingId", paymentController.getUserPaymentStatus);

module.exports = router;