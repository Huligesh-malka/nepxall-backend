const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middlewares/authMiddleware");

const {
  getOwnerBookings,
  updateBookingStatus,
  getActiveTenantsByOwner,
} = require("../controllers/ownerBookingController");

router.get("/bookings", firebaseAuth, getOwnerBookings);
router.put("/bookings/:bookingId", firebaseAuth, updateBookingStatus);
router.get("/tenants", firebaseAuth, getActiveTenantsByOwner);

router.post(
  "/vacate/approve/:bookingId",
  firebaseAuth,
  approveVacateRequest
);


module.exports = router;