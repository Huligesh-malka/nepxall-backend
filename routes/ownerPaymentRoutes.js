const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const { 
    getOwnerPayments, 
    signOwnerAgreement 
} = require("../controllers/ownerPaymentController");

router.get("/payments", auth, getOwnerPayments);
router.post("/sign-agreement", auth, signOwnerAgreement); // Match the frontend axios call

module.exports = router;