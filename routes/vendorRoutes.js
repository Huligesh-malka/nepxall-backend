const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const vendorController = require("../controllers/vendorController");

/* ======================================================
   GET ALL SERVICES ASSIGNED TO VENDOR
====================================================== */
router.get(
  "/services",
  auth,
  vendorController.getVendorServices
);


/* ======================================================
   UPDATE SERVICE STATUS (START / COMPLETE JOB)
====================================================== */
router.put(
  "/services/:id/status",
  auth,
  vendorController.updateVendorServiceStatus
);

module.exports = router;