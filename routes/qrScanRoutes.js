const express = require("express");
const router = express.Router();
const qrScanController = require("../controllers/qrScanController");
const authMiddleware = require("../middleware/authMiddleware"); // If you have auth middleware

// Public routes - no authentication required
router.get("/:id", qrScanController.getPGScanData);
router.post("/:id/track", qrScanController.trackQRScan);

// Protected routes - require authentication (for owners to see analytics)
router.get("/:id/statistics", authMiddleware, qrScanController.getScanStatistics);

module.exports = router;