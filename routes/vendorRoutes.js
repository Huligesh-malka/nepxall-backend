const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const vendorController = require("../controllers/vendorController");

// Protect with auth middleware
router.get("/services", auth, vendorController.getVendorServices);
router.put("/services/:id/status", auth, vendorController.updateVendorServiceStatus);

module.exports = router;