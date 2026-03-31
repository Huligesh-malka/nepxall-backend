const express = require("express");
const router = express.Router();
const ownerController = require("../controllers/ownerPaymentController");
const auth = require("../middlewares/authMiddleware");

/**
 * --- PROTECTED ROUTES ---
 * These require a valid JWT token in the Authorization header.
 * Used for the main Owner Dashboard views.
 */
// Fetch all payments/bookings for the logged-in owner
router.get("/payments", auth, ownerController.getOwnerPayments);

// Get total earnings and booking count summary
router.get("/settlements/summary", auth, ownerController.getOwnerSettlementSummary);

// Mark a specific agreement as 'Viewed' when the owner opens the draft
router.post("/agreements/viewed", auth, ownerController.markAgreementViewed);


/**
 * --- PUBLIC / SECURE SIGNING ROUTES ---
 * These do not require a login token because they are part of the 
 * external signing flow. Security is handled by Mobile/OTP verification.
 */

/** 
 * 1. PRE-VERIFICATION
 * Checks if the entered mobile number matches the owner_id linked to the booking.
 * Returns 403 "This mobile number is not registered for this booking" if it fails.
 */
router.post("/agreements/verify-owner", ownerController.verifyOwnerForBooking);

/** 
 * 2. FINAL SIGNATURE & CLOUDINARY UPLOAD
 * Processes the signature, overlays it on the PDF, and updates the database.
 * Also stores the IP and Device Info for the legal audit trail.
 */
router.post("/agreements/sign", ownerController.signOwnerAgreement);

module.exports = router;