const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const adminOnly = require("../middlewares/admin");
const controller = require("../controllers/adminOwnerVerificationController");

// 📄 View all owner documents
router.get(
  "/owner-verifications",
  auth,
  adminOnly,
  controller.getAllOwnerVerifications
);

// ✅ Approve
router.patch(
  "/owner-verifications/:id/approve",
  auth,
  adminOnly,
  controller.approveOwnerVerification
);

// ❌ Reject
router.patch(
  "/owner-verifications/:id/reject",
  auth,
  adminOnly,
  controller.rejectOwnerVerification
);

module.exports = router;
