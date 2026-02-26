const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middlewares/auth");

const {
  getOwnerBookings,
  updateBookingStatus,
  getActiveTenantsByOwner,
} = require("../controllers/ownerBookingController");

router.get("/bookings", firebaseAuth, getOwnerBookings);
router.put("/bookings/:bookingId", firebaseAuth, updateBookingStatus);
router.get("/tenants", firebaseAuth, getActiveTenantsByOwner);

module.exports = router;