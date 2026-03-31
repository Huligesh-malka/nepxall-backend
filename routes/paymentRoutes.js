const express = require("express");
const router = express.Router();
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

const paymentController = require("../controllers/paymentController");
const webhookController = require("../controllers/paymentWebhookController");
const verifyFirebaseToken = require("../middlewares/authMiddleware");

//////////////////////////////////////////////////////
// CLOUDINARY CONFIGURATION (using your existing setup)
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

// Configure multer with Cloudinary storage
const uploadScreenshot = multer({
  storage: screenshotStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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

// Confirm payment (without screenshot)
router.post(
  "/confirm-payment",
  verifyFirebaseToken,
  paymentController.confirmPayment
);

// Submit payment with screenshot (using Cloudinary)
router.post(
  "/submit-screenshot",
  verifyFirebaseToken,
  uploadScreenshot.single("screenshot"),
  paymentController.submitPaymentWithScreenshot
);

// Get payment status for a booking
router.get(
  "/status/:bookingId",
  verifyFirebaseToken,
  paymentController.getUserPaymentStatus
);

// Match bank transaction (for auto-verification)
router.post(
  "/match-bank-transaction",
  verifyFirebaseToken,
  paymentController.matchBankTransaction
);

// Webhook for payment gateways
router.post(
  "/webhook",
  webhookController.paymentWebhook
);

//////////////////////////////////////////////////////
// ADMIN PAYMENT PANEL ROUTES
//////////////////////////////////////////////////////

// Get all payments for admin
router.get(
  "/admin/payments",
  verifyFirebaseToken,
  paymentController.getAdminPayments
);

// Verify payment (admin action)
router.put(
  "/admin/payments/:orderId/verify",
  verifyFirebaseToken,
  paymentController.verifyPayment
);

// Reject payment (admin action)
router.put(
  "/admin/payments/:orderId/reject",
  verifyFirebaseToken,
  paymentController.rejectPayment
);

module.exports = router;