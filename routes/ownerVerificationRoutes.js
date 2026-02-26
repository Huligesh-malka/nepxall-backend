const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const controller = require("../controllers/ownerVerificationController");

// Aadhaar Verification Flow
router.post("/verification/aadhaar/send-otp", auth, controller.sendAadhaarOtp);
router.post("/verification/aadhaar/verify-otp", auth, controller.verifyAadhaarOtp);

// Global Status Check
router.get("/verification/status", auth, controller.getVerificationStatus);

module.exports = router;