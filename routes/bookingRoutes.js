const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middlewares/authMiddleware");
const bookingController = require("../controllers/bookingController");

// ✅ CREATE BOOKING
router.post("/:pgId", firebaseAuth, bookingController.createBooking);

// ✅ USER BOOKING HISTORY
router.get("/user/history", firebaseAuth, bookingController.getUserBookings);

// 🔥 ADD THIS (IMPORTANT - YOUR ERROR FIX)
router.get(
  "/user/active-stay",
  firebaseAuth,
  bookingController.getUserActiveStay
);

// ✅ PAYMENT DONE
router.post("/pay/:bookingId", firebaseAuth, bookingController.markPaymentDone);

// ✅ OWNER BOOKINGS
router.get("/owner/bookings", firebaseAuth, bookingController.getOwnerBookings);

// ✅ OWNER APPROVE / REJECT
router.put("/owner/bookings/:bookingId", firebaseAuth, bookingController.updateBookingStatus);

// ✅ OWNER TENANTS
router.get("/owner/tenants", firebaseAuth, bookingController.getActiveTenantsByOwner);

module.exports = router;