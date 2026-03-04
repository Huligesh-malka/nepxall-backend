const express = require("express");
const router = express.Router();
const adminServiceController = require("../controllers/adminServiceController");
const auth = require("../middlewares/auth");

// This matches: GET /api/admin/services
router.get("/", auth, adminServiceController.getAllServiceBookings);

// This matches: GET /api/admin/services/vendors
router.get("/vendors", auth, adminServiceController.getVendors);

// This matches: POST /api/admin/services/assign-vendor
router.post("/assign-vendor", auth, adminServiceController.assignVendor);

module.exports = router;