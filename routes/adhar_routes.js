const express = require("express");
const router = express.Router();

const firebaseAuth = require("../middlewares/auth");
const adharController = require("../controllers/adharController");

router.post("/send-otp", firebaseAuth, adharController.generateAadhaarOtp);
router.post("/verify-otp", firebaseAuth, adharController.verifyAadhaarOtp);
router.get("/status", firebaseAuth, adharController.getKycStatus);

module.exports = router;
