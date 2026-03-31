const express = require("express");
const router = express.Router();
const adminServiceController = require("../controllers/adminServiceController");
const auth = require("../middlewares/authMiddleware");

/* GET ALL SERVICE BOOKINGS */
router.get("/services", auth, adminServiceController.getAllServiceBookings);

/* GET ALL VENDORS */
router.get("/vendors", auth, adminServiceController.getVendors);

/* ASSIGN VENDOR */
router.post("/assign-vendor", auth, adminServiceController.assignVendor);

module.exports = router;