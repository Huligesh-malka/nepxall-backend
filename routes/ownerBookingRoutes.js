const express = require("express");
const router = express.Router();

const firebaseAuth = require("../middlewares/auth");

const {
  getOwnerBookings,
  updateBookingStatus,
  getActiveTenantsByOwner   // ⭐ NEW (for pg_users table)
} = require("../controllers/bookingController");


/* ======================================================
   📥 OWNER → VIEW ALL BOOKING REQUESTS
====================================================== */
router.get("/bookings", firebaseAuth, getOwnerBookings);


/* ======================================================
   ✅ OWNER → APPROVE / REJECT BOOKING
====================================================== */
router.put("/bookings/:bookingId", firebaseAuth, updateBookingStatus);


/* ======================================================
   👥 OWNER → VIEW ACTIVE TENANTS (FROM pg_users)
====================================================== */
router.get("/tenants", firebaseAuth, getActiveTenantsByOwner);


module.exports = router;
