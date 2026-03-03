const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const controller = require("../controllers/adminServiceController");

router.get("/services", auth, controller.getAllServiceBookings);
router.get("/vendors", auth, controller.getVerifiedVendors);
router.post("/assign-vendor", auth, controller.assignVendor);
router.get("/summary", auth, controller.getServiceSummary);

module.exports = router;