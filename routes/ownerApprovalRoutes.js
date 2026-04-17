const express = require("express");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");
const adminOnly = require("../middlewares/admin");

const ownerApprovalController = require("../controllers/ownerApprovalController");

//////////////////////////////////////////////////////
// 🔥 OWNER APPROVAL ROUTES
//////////////////////////////////////////////////////

// Get all pending owner requests
router.get(
  "/pending",
  auth,
  adminOnly,
  ownerApprovalController.getPendingOwners
);

// Approve owner
router.patch(
  "/approve/:id",
  auth,
  adminOnly,
  ownerApprovalController.approveOwner
);

// Reject owner
router.patch(
  "/reject/:id",
  auth,
  adminOnly,
  ownerApprovalController.rejectOwner
);

module.exports = router;