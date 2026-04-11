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
  rejectVacateRequest,
} = ownerController;

// ================= BOOKINGS =================
router.get("/bookings", firebaseAuth, getOwnerBookings);
router.put("/bookings/:bookingId", firebaseAuth, updateBookingStatus);
router.get("/tenants", firebaseAuth, getActiveTenantsByOwner);

// ================= VACATE =================
router.get("/vacate/requests", firebaseAuth, getVacateRequests);

// ✅ OWNER APPROVE
router.post(
  "/vacate/approve/:bookingId",
  firebaseAuth,
  approveVacateRequest
);

// ❌ OWNER REJECT
router.post(
  "/refund/reject/:bookingId",
  firebaseAuth,
  rejectVacateRequest
);

// 💰 OWNER MARK AS PAID (✅ FIXED)
router.post(
  "/refund/mark-paid/:id",   // ✅ refund.id
  firebaseAuth,
  markRefundPaid
);


module.exports = router;