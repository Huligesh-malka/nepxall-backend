const express = require("express");
const router = express.Router();
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

const paymentController = require("../controllers/paymentController");
const webhookController = require("../controllers/paymentWebhookController");
const verifyFirebaseToken = require("../middlewares/authMiddleware");

//////////////////////////////////////////////////////
// CLOUDINARY CONFIGURATION
//////////////////////////////////////////////////////
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

//////////////////////////////////////////////////////
// PAYMENT SCREENSHOT STORAGE
//////////////////////////////////////////////////////
const screenshotStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const ext = file.mimetype.split("/")[1];
    
    return {
      folder: "payment-screenshots",
      public_id: `payment-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      resource_type: "image",
      format: ext,
      transformation: [
        {
          width: 800,
          height: 600,
          crop: "limit",
          quality: "auto",
          fetch_format: "auto",
        },
      ],
    };
  },
});

const uploadScreenshot = multer({
  storage: screenshotStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"), false);
    }
    cb(null, true);
  },
});

//////////////////////////////////////////////////////
// USER PAYMENT ROUTES
//////////////////////////////////////////////////////

// Create new payment
router.post(
  "/create-payment",
  verifyFirebaseToken,
  paymentController.createPayment
);

router.post(
  "/create-cashfree-order",
  verifyFirebaseToken,
  paymentController.createCashfreeOrder
);

// Get payment status for a booking
router.get(
  "/status/:bookingId",
  verifyFirebaseToken,
  paymentController.getUserPaymentStatus
);

// Agreement status
router.get(
  "/agreement-status/:bookingId",
  verifyFirebaseToken,
  paymentController.getAgreementStatus
);

// Webhook for payment gateways
router.post(
  "/webhook",
  webhookController.paymentWebhook
);

//////////////////////////////////////////////////////
// ADMIN PAYMENT PANEL ROUTES (READ ONLY)
//////////////////////////////////////////////////////

// Get all payments for admin (read only)
router.get(
  "/admin/payments",
  verifyFirebaseToken,
  paymentController.getAdminPayments
);

// REMOVED: verifyPayment, rejectPayment, submitPaymentWithScreenshot, matchBankTransaction, confirmPayment

//////////////////////////////////////////////////////
// REFUND ROUTES
//////////////////////////////////////////////////////

// User request refund
router.post(
  "/refunds/request",
  verifyFirebaseToken,
  paymentController.requestRefund
);

// Admin get all refunds
router.get(
  "/admin/refunds",
  verifyFirebaseToken,
  paymentController.getAllRefunds
);

// Admin update refund status
router.put(
  "/admin/refunds/:refundId",
  verifyFirebaseToken,
  paymentController.updateRefundStatus
);

module.exports = router;