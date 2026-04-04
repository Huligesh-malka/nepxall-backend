const express = require("express");
const router = express.Router();

const firebaseAuth = require("../middlewares/authMiddleware");
const bookingController = require("../controllers/bookingController");

// ================= BOOKINGS =================

// ✅ CREATE BOOKING
router.post("/:pgId", firebaseAuth, bookingController.createBooking);

// ✅ USER BOOKING HISTORY
router.get("/user/history", firebaseAuth, bookingController.getUserBookings);

// ✅ USER ACTIVE STAY
router.get("/user/active-stay", firebaseAuth, bookingController.getUserActiveStay);

// ✅ PAYMENT DONE
router.post("/pay/:bookingId", firebaseAuth, bookingController.markPaymentDone);

// ================= OWNER =================

// ✅ OWNER BOOKINGS
router.get("/owner/bookings", firebaseAuth, bookingController.getOwnerBookings);

// ✅ OWNER APPROVE / REJECT
router.put("/owner/bookings/:bookingId", firebaseAuth, bookingController.updateBookingStatus);

// ✅ OWNER TENANTS
router.get("/owner/tenants", firebaseAuth, bookingController.getActiveTenantsByOwner);


// ================= 🔥 REFUND (ADD THIS ONLY) =================

// ✅ USER REQUEST REFUND
router.post("/refunds/request", firebaseAuth, bookingController.requestRefund);
// ================= 🔥 VACATE (ADD THIS) =================

// ✅ USER REQUEST VACATE
router.post("/vacate/request", firebaseAuth, bookingController.requestVacate);


module.exports = router;