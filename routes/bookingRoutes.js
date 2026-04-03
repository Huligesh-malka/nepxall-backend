const express = require("express");
const router = express.Router();

const firebaseAuth = require("../middlewares/authMiddleware");
const bookingController = require("../controllers/bookingController");
const refundController = require("../controllers/refundController"); // 🔥 ADD THIS

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


// ================= 🔥 REFUND =================

// ✅ USER REQUEST REFUND
router.post("/refunds/request", firebaseAuth, refundController.requestRefund);

// ✅ ADMIN VIEW REFUNDS
router.get("/refunds", firebaseAuth, refundController.getAllRefunds);

// ✅ ADMIN APPROVE / REJECT / PAID
router.put("/refunds/:refundId", firebaseAuth, refundController.updateRefundStatus);


module.exports = router;