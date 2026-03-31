const express = require("express");
const router = express.Router();
const ownerController = require("../controllers/ownerPaymentController");
const auth = require("../middlewares/authMiddleware");

// --- PROTECTED ROUTES (Requires Login) ---
router.get("/payments", auth, ownerController.getOwnerPayments);
router.get("/settlements/summary", auth, ownerController.getOwnerSettlementSummary);
router.post("/agreements/viewed", auth, ownerController.markAgreementViewed);

// --- PUBLIC ROUTES (No Token Required - Handled by Mobile/OTP Security) ---
// 1. Verify if the mobile number belongs to the booking owner before sending OTP
router.post("/agreements/verify-owner", ownerController.verifyOwnerForBooking);

// 2. Final signature upload
router.post("/agreements/sign", ownerController.signOwnerAgreement);

module.exports = router;