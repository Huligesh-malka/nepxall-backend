const express = require("express");
const router = express.Router();

const qrScanController = require("../controllers/qrScanController");
const auth = require("../middlewares/auth");

/* ================= PUBLIC QR SCAN ================= */

// Get PG data when QR is scanned
router.get("/pg/:id", qrScanController.getPGScanData);

// Track QR scan (analytics)
router.post("/pg/:id/track", qrScanController.trackQRScan);


/* ================= OWNER ANALYTICS ================= */

// Owner can see scan statistics
router.get(
  "/pg/:id/statistics",
  auth,
  qrScanController.getScanStatistics
);

module.exports = router;