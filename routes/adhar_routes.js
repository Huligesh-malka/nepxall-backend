const express = require("express");
const router = express.Router();

const firebaseAuth = require("../middlewares/auth");
const adharController = require("../controllers/adharController");




router.get("/profile", firebaseAuth, adharController.getKycProfile);
router.post("/send-otp", firebaseAuth, adharController.generateAadhaarOtp);
router.post("/verify-otp", firebaseAuth, adharController.verifyAadhaarOtp);


module.exports = router;
