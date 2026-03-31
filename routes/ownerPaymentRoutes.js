const express = require("express");
const router = express.Router();
const ownerController = require("../controllers/ownerPaymentController");
const auth = require("../middlewares/authMiddleware");

/**
 * --- PROTECTED ROUTES ---
 * Requires JWT token. Used for the Internal Owner Dashboard.
 */

// Fetch all payments/bookings for the logged-in owner
router.get("/payments", auth, ownerController.getOwnerPayments);

// Get total earnings and booking count summary
router.get("/settlements/summary", auth, ownerController.getOwnerSettlementSummary);

// Mark a specific agreement as 'Viewed' (audit trail)
router.post("/agreements/viewed", auth, ownerController.markAgreementViewed);


/**
 * --- PUBLIC / SECURE SIGNING ROUTES ---
 * Secured via Mobile/OTP verification instead of JWT for external access.
 */

/** 
 * 1. PRE-VERIFICATION
 * Verifies if the mobile number belongs to the owner of the booking.
 */
router.post("/agreements/verify-owner", ownerController.verifyOwnerForBooking);

/** 
 * 2. TENANT INITIAL SUBMISSION
 * Captures Tenant IP, Device, and Location.
 */
router.post("/agreements/tenant-submit", ownerController.submitTenantAgreement);

/** 
 * 3. FINAL OWNER SIGNATURE & CLOUDINARY UPLOAD
 * Processes the signature, overlays metadata (IP, Loc, Date) on PDF.
 */
router.post("/agreements/sign", ownerController.signOwnerAgreement);

module.exports = router;