const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const adminServiceController = require("../controllers/adminServiceController");

router.get("/services", auth, adminServiceController.getAllServiceBookings);
router.get("/vendors", auth, adminServiceController.getVendors);
router.post("/assign-vendor", auth, adminServiceController.assignVendor);

module.exports = router;