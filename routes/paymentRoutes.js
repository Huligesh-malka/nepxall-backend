const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const paymentController = require("../controllers/paymentController");
const webhookController = require("../controllers/paymentWebhookController");
const verifyFirebaseToken = require("../middlewares/auth");

//////////////////////////////////////////////////////
// MULTER CONFIGURATION FOR SCREENSHOT UPLOADS
//////////////////////////////////////////////////////

// Ensure upload directory exists
const uploadDir = "uploads/screenshots";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `screenshot-${uniqueSuffix}${ext}`);
  }
});

// File filter - only accept images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files are allowed (jpeg, jpg, png, gif, webp)"));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
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

// NEW: Submit payment with screenshot
router.post(
  "/submit-screenshot",
  verifyFirebaseToken,
  upload.single("screenshot"),
  paymentController.submitPaymentWithScreenshot
);

// NEW: Get payment status for a booking
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

// NEW: View payment screenshot (admin only)
router.get(
  "/admin/screenshot/:orderId",
  verifyFirebaseToken,
  paymentController.viewPaymentScreenshot
);

module.exports = router;