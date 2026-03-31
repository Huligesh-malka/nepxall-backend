const express = require("express");
const router = express.Router();

const {
  getOwnerPayments,
  getOwnerSettlementSummary,
  signOwnerAgreement,
  markAgreementViewed,
  sendOwnerOtp,
  verifyOwnerOtp
} = require("../controllers/ownerPaymentController");

const auth = require("../middlewares/authMiddleware");

/* ================= ROLE CHECK ================= */
const requireOwner = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  if (req.user.role !== "owner") {
    return res.status(403).json({
      success: false,
      message: "Access denied (Owner only)",
    });
  }

  next();
};

/* ================= OTP ROUTES ================= */

// 📲 Send OTP (NEW)
router.post(
  "/otp/send",
  auth,
  requireOwner,
  (req, res, next) => {
    const { mobile } = req.body;

    if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: "Valid mobile number required",
      });
    }

    next();
  },
  sendOwnerOtp
);

// 🔐 Verify OTP (NEW)
router.post(
  "/otp/verify",
  auth,
  requireOwner,
  (req, res, next) => {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({
        success: false,
        message: "Mobile and OTP required",
      });
    }

    next();
  },
  verifyOwnerOtp
);

/* ================= OWNER ROUTES ================= */

// 💰 Get owner payments
router.get(
  "/payments",
  auth,
  requireOwner,
  getOwnerPayments
);

// 📊 Settlement summary
router.get(
  "/settlements/summary",
  auth,
  requireOwner,
  getOwnerSettlementSummary
);

// 👁️ Mark agreement viewed
router.post(
  "/agreements/viewed",
  auth,
  requireOwner,
  (req, res, next) => {
    if (!req.body.booking_id) {
      return res.status(400).json({
        success: false,
        message: "booking_id required",
      });
    }
    next();
  },
  markAgreementViewed
);

// ✍️ Sign agreement (OTP REQUIRED)
router.post(
  "/agreements/sign",
  auth,
  requireOwner,
  (req, res, next) => {
    const { booking_id, owner_signature, accepted_terms, owner_mobile } = req.body;

    if (!booking_id || !owner_signature || !accepted_terms || !owner_mobile) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    next();
  },
  signOwnerAgreement
);

module.exports = router;