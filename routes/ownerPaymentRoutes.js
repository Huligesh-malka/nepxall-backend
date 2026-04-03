const express = require("express");
const router = express.Router();
const ownerController = require("../controllers/ownerPaymentController");
const auth = require("../middlewares/authMiddleware");

/**
 * =================================================================
 * --- PROTECTED ROUTES ---
 * Requires a valid JWT token (Owner must be logged in).
 * Used for the internal Dashboard and Management views.
 * =================================================================
 */

// 1. Fetch all bookings and payment details for the logged-in owner
router.get("/payments", auth, ownerController.getOwnerPayments);

// 2. Get high-level settlement summary (Total bookings, Total earned)
router.get("/settlements/summary", auth, ownerController.getOwnerSettlementSummary);

// 3. Track when an owner views a draft agreement (Audit Log)
router.post("/agreements/viewed", auth, ownerController.markAgreementViewed);


// Change this line:
// router.get("/receipt/:bookingId", auth, ownerController.getOwnerReceiptDetails);

// To this:
router.get("/receipt-details/:bookingId", auth, ownerController.getOwnerReceiptDetails);


/**
 * =================================================================
 * --- PUBLIC / SECURE SIGNING ROUTES ---
 * No JWT required. Security is enforced via:
 * 1. Booking ID lookup
 * 2. Registered Mobile matching
 * 3. Firebase OTP Verification (handled on frontend)
 * =================================================================
 */

/** * 1. PRE-SIGNING VERIFICATION
 * Verifies if the provided mobile number matches the owner assigned to the booking.
 * Required before the frontend triggers the Firebase OTP flow.
 */
router.post("/agreements/verify-owner", ownerController.verifyOwnerForBooking);

/** * 2. FINAL DIGITAL SIGNATURE & AUDIT TRAIL
 * Processes the signature, overlays IP/Date/Mobile on the PDF, 
 * uploads to Cloudinary, and saves IP/Device Info to the database.
 */
router.post("/agreements/sign", ownerController.signOwnerAgreement);

module.exports = router;