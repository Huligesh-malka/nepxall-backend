const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middlewares/authMiddleware");

const adminController = require("../controllers/adminRefundController");

// 👑 ADMIN REFUNDS

// ✅ GET ALL FULL REFUNDS
router.get("/refunds", firebaseAuth, adminController.getAllRefunds);

// ✅ APPROVE FULL REFUND
router.post("/refunds/:id/approve", firebaseAuth, adminController.approveRefund);

// ✅ COMPLETE FULL REFUND (🔥 FIXED ROUTE)
router.post("/refunds/:id/complete", firebaseAuth, adminController.markRefundCompletedAdmin);

module.exports = router;