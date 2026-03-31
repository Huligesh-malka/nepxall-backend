const express = require("express");
const router = express.Router();

const {
  getOwnerPayments,
  getOwnerSettlementSummary,
  signOwnerAgreement,
  markAgreementViewed,
} = require("../controllers/ownerPaymentController");

const auth = require("../middlewares/authMiddleware");

/* ================= ROLE CHECK MIDDLEWARE ================= */
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

// ✍️ Sign agreement
router.post(
  "/agreements/sign",
  auth,
  requireOwner,
  (req, res, next) => {
    const { booking_id, owner_signature, accepted_terms } = req.body;

    if (!booking_id || !owner_signature || !accepted_terms) {
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