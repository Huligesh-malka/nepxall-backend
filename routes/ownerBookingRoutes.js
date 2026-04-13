const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middlewares/authMiddleware");
const db = require("../db"); // 🔥 ADD THIS

const ownerController = require("../controllers/ownerBookingController");

const {
  getOwnerBookings,
  updateBookingStatus,
  getActiveTenantsByOwner,
  getOwnerActiveTenants,
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

router.get("/tenants", firebaseAuth, getActiveTenantsByOwner);
router.get("/tenants/active", firebaseAuth, getOwnerActiveTenants);

//////////////////////////////////////////////////////
// ================= VACATE =================
//////////////////////////////////////////////////////

router.get("/vacate/requests", firebaseAuth, getVacateRequests);

router.post(
  "/vacate/approve/:bookingId",
  firebaseAuth,
  approveVacateRequest
);

router.post(
  "/refund/reject/:bookingId",
  firebaseAuth,
  rejectVacateRequest
);

router.post(
  "/refund/mark-paid/:id",
  firebaseAuth,
  markRefundPaid
);

//////////////////////////////////////////////////////
// ================= PLAN (🔥 NEW FIX) =================
//////////////////////////////////////////////////////

router.get("/current-plan", firebaseAuth, async (req, res) => {
  try {
    const ownerId = req.user.id;

    const [[user]] = await db.query(
      "SELECT plan, plan_expiry FROM users WHERE id=?",
      [ownerId]
    );

    res.json({
      success: true,
      plan: user?.plan || "free",
      expiry: user?.plan_expiry || null
    });

  } catch (err) {
    console.error("Get current plan error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

module.exports = router;