const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middlewares/authMiddleware");

const ownerController = require("../controllers/ownerBookingController");

const {
  getOwnerBookings,
  updateBookingStatus,
  getActiveTenantsByOwner,
  getVacateRequests,
  approveVacateRequest,
  markRefundPaid,
  rejectVacateRequest   // ✅ NEW
} = ownerController;

// ================= BOOKINGS =================
router.get("/bookings", firebaseAuth, getOwnerBookings);
router.put("/bookings/:bookingId", firebaseAuth, updateBookingStatus);
router.get("/tenants", firebaseAuth, getActiveTenantsByOwner);

// ================= VACATE =================
router.get("/vacate/requests", firebaseAuth, getVacateRequests);

// ✅ OWNER APPROVE / RE-APPROVE
router.post(
  "/vacate/approve/:bookingId",
  firebaseAuth,
  approveVacateRequest
);

// ❌ OWNER REJECT (NEW)
router.post(
  "/refund/reject/:bookingId",
  firebaseAuth,
  rejectVacateRequest
);

// 💰 MARK AS PAID
router.post(
  "/refund/mark-paid/:bookingId",
  firebaseAuth,
  markRefundPaid
);

module.exports = router;