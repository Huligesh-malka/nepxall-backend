const express = require("express");
const router = express.Router();
const qrScanController = require("../controllers/qrScanController");

// 🔐 Auth middleware
const auth = require("../middlewares/authMiddleware");

//////////////////////////////////////////////////////
// ✅ PUBLIC ROUTES (NO LOGIN)
//////////////////////////////////////////////////////

// Get PG details after QR scan
router.get("/:id", qrScanController.getPGScanData);

// Track scan event
router.post("/:id/track", qrScanController.trackQRScan);

//////////////////////////////////////////////////////
// 🔐 PROTECTED ROUTES (LOGIN REQUIRED)
//////////////////////////////////////////////////////

// Get scan statistics (owner/admin)
router.get("/:id/statistics", auth, qrScanController.getScanStatistics);

// ⭐ NEW: Check payment + Check-in user
router.post("/checkin", auth, qrScanController.checkAndCheckinUser);

//////////////////////////////////////////////////////

module.exports = router;