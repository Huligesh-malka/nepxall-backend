const express = require("express");
const router = express.Router();
const qrScanController = require("../controllers/qrScanController");

// Public routes - no authentication required
router.get("/:id", qrScanController.getPGScanData);
router.post("/:id/track", qrScanController.trackQRScan);

// Protected routes - require authentication
const authMiddleware = require("../middleware/authMiddleware");
router.get("/:id/statistics", authMiddleware, qrScanController.getScanStatistics);

module.exports = router;