const express = require("express");
const router = express.Router();
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

const paymentController = require("../controllers/paymentController");
const webhookController = require("../controllers/paymentWebhookController");
const verifyFirebaseToken = require("../middlewares/authMiddleware");

//////////////////////////////////////////////////////
// CLOUDINARY CONFIG
//////////////////////////////////////////////////////
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

//////////////////////////////////////////////////////
// STORAGE
//////////////////////////////////////////////////////
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const ext = file.mimetype.split("/")[1];
    return {
      folder: "payment-screenshots",
      public_id: `payment-${Date.now()}`,
      format: ext,
    };
  },
});

const upload = multer({ storage });

//////////////////////////////////////////////////////
// USER ROUTES
//////////////////////////////////////////////////////

router.post("/create-payment", verifyFirebaseToken, paymentController.createPayment);

router.post("/confirm-payment", verifyFirebaseToken, paymentController.confirmPayment);

router.post(
  "/submit-screenshot",
  verifyFirebaseToken,
  upload.single("screenshot"),
  paymentController.submitPaymentWithScreenshot
);

router.get("/status/:bookingId", verifyFirebaseToken, paymentController.getUserPaymentStatus);

router.post("/match-bank-transaction", verifyFirebaseToken, paymentController.matchBankTransaction);

// 🔥 FIX (important)
router.post("/webhook", webhookController.paymentWebhook || ((req,res)=>res.send("ok")));

//////////////////////////////////////////////////////
// ADMIN PAYMENT
//////////////////////////////////////////////////////

router.get("/admin/payments", verifyFirebaseToken, paymentController.getAdminPayments);

router.put("/admin/payments/:orderId/verify", verifyFirebaseToken, paymentController.verifyPayment);

router.put("/admin/payments/:orderId/reject", verifyFirebaseToken, paymentController.rejectPayment);

//////////////////////////////////////////////////////
// 🔥 REFUND ROUTES (FINAL)
//////////////////////////////////////////////////////

// USER
router.post("/refunds/request", verifyFirebaseToken, paymentController.requestRefund);

// ADMIN
router.get("/admin/refunds", verifyFirebaseToken, paymentController.getAllRefunds);

router.put("/admin/refunds/:refundId", verifyFirebaseToken, paymentController.updateRefundStatus);

module.exports = router;