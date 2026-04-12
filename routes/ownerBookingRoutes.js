const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middlewares/authMiddleware");

const ownerController = require("../controllers/ownerBookingController");

const {
  getOwnerBookings,
  updateBookingStatus,
  getActiveTenantsByOwner,
  getOwnerActiveTenants,   // ✅ NEW (your new API)
  getVacateRequests,
  approveVacateRequest,
  markRefundPaid,
  rejectVacateRequest,
} = ownerController;

//////////////////////////////////////////////////////
// ================= BOOKINGS =================
//////////////////////////////////////////////////////

router.get("/bookings", firebaseAuth, getOwnerBookings);
router.put("/bookings/:bookingId", firebaseAuth, updateBookingStatus);

//////////////////////////////////////////////////////
// ================= TENANTS =================
//////////////////////////////////////////////////////

// ✅ OLD (basic)
router.get("/tenants", firebaseAuth, getActiveTenantsByOwner);

// ✅ NEW (FULL DETAILS - RECOMMENDED)
router.get("/tenants/active", firebaseAuth, getOwnerActiveTenants);

//////////////////////////////////////////////////////
// ================= VACATE =================
//////////////////////////////////////////////////////

router.get("/vacate/requests", firebaseAuth, getVacateRequests);

// ✅ OWNER APPROVE VACATE
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

// 💰 OWNER MARK AS PAID
router.post(
  "/refund/mark-paid/:id",
  firebaseAuth,
  markRefundPaid
);

module.exports = router;