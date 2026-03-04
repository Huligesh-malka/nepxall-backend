const express = require("express");
const router = express.Router();
const adminServiceController = require("../controllers/adminServiceController");
const auth = require("../middlewares/auth");

router.get("/services", auth, adminServiceController.getAllServiceBookings);

router.get("/vendors", auth, adminServiceController.getVendors);

router.post("/assign-vendor", auth, adminServiceController.assignVendor);

module.exports = router;