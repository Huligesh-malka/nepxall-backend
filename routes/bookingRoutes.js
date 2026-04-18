const express = require("express");
const router = express.Router();

const firebaseAuth = require("../middlewares/authMiddleware");
const bookingController = require("../controllers/bookingController");

/* ✅ IMPORT AGREEMENT FUNCTION */
const { getAgreementStatus } = require("../controllers/paymentController");

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

// ================= AGREEMENT =================

// ✅ CHECK AGREEMENT STATUS (🔥 FIXED)
router.get("/agreement-status/:bookingId", firebaseAuth, getAgreementStatus);

// ================= 🔥 REFUND =================

// ✅ USER REQUEST REFUND
router.post("/refunds/request", firebaseAuth, bookingController.requestRefund);

// ✅ USER ACCEPT REFUND
router.post("/refunds/accept", firebaseAuth, bookingController.acceptRefund);

// ✅ USER REJECT REFUND
router.post("/refunds/reject", firebaseAuth, bookingController.rejectRefund);

// ================= 🔥 VACATE =================

// ✅ USER REQUEST VACATE
router.post("/vacate/request", firebaseAuth, bookingController.requestVacate);

module.exports = router;