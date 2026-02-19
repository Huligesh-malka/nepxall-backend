const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth"); // ✅ FIXED
const controller = require("../controllers/agreementController");

/* ================= AGREEMENT FLOW ================= */

// 1️⃣ User requests agreement
router.post(
  "/request/:bookingId",
  auth,
  controller.requestAgreement
);

// 2️⃣ Generate draft agreement
router.post(
  "/generate/:bookingId",
  auth,
  controller.generateDraftAgreement
);

// 3️⃣ Get agreement by booking
router.get(
  "/booking/:bookingId",
  auth,
  controller.getAgreementByBooking
);

module.exports = router;
