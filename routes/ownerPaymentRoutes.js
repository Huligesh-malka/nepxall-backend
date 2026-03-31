const express = require("express");
const router = express.Router();
const {
  getOwnerPayments,
  getOwnerSettlementSummary,
  signOwnerAgreement,
  markAgreementViewed
} = require("../controllers/ownerPaymentController");

const auth = require("../middlewares/authMiddleware");

// --- PROTECTED ROUTES (Requires Login Token) ---
// Used for the owner dashboard to see their list of payments
router.get("/payments", auth, getOwnerPayments);
router.get("/settlements/summary", auth, getOwnerSettlementSummary);
router.post("/agreements/viewed", auth, markAgreementViewed);

// --- PUBLIC ROUTE (No Token Required) ---
// This allows the owner to sign after verifying via Phone/OTP in the modal
// We rely on the 'booking_id' and 'owner_mobile' check inside the controller for security.
router.post("/agreements/sign", signOwnerAgreement);

module.exports = router;