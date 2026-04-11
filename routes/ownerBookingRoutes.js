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
    // 🔥 ADD THIS
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

// ❌ OWNER REJECT
router.post(
  "/refund/reject/:bookingId",
  firebaseAuth,
  rejectVacateRequest
);

// 💰 OWNER MARK AS PAID (DEPOSIT)
router.post(
  "/refund/mark-paid/:bookingId",
  firebaseAuth,
  markRefundPaid
);


router.post(
  "/refund/sync/:bookingId",
  firebaseAuth,
  ownerController.syncRefundStatus
);



module.exports = router;