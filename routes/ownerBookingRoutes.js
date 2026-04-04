const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middlewares/authMiddleware");

const {
  getOwnerBookings,
  updateBookingStatus,
  getActiveTenantsByOwner,
  getVacateRequests,       // ✅ ADD THIS
  approveVacateRequest     // ✅ ADD THIS
} = require("../controllers/ownerBookingController");

// ================= BOOKINGS =================
router.get("/bookings", firebaseAuth, getOwnerBookings);
router.put("/bookings/:bookingId", firebaseAuth, updateBookingStatus);
router.get("/tenants", firebaseAuth, getActiveTenantsByOwner);

// ================= VACATE =================
router.get(
  "/vacate/requests",
  firebaseAuth,
  getVacateRequests
);

router.post(
  "/vacate/approve/:bookingId",
  firebaseAuth,
  approveVacateRequest
);

module.exports = router;