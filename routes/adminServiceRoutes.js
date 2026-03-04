const express = require("express");
const router = express.Router();
const adminServiceController = require("../controllers/adminServiceController");
const auth = require("../middlewares/auth");

// This will map to: GET /api/admin/services/list
router.get("/list", auth, adminServiceController.getAllServiceBookings);

// This will map to: GET /api/admin/services/vendors
router.get("/vendors", auth, adminServiceController.getVendors);

// This will map to: POST /api/admin/services/assign
router.post("/assign", auth, adminServiceController.assignVendor);

module.exports = router;