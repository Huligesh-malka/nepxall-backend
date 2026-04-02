const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middlewares/authMiddleware");
const bookingController = require("../controllers/bookingController");

// ==========================================
// 🧑 TENANT / USER ROUTES
// ==========================================

// 🔥 1. ACTIVE STAY (Moved to top to prevent conflict with /:pgId)
router.get(
  "/user/active-stay",
  firebaseAuth,
  bookingController.getUserActiveStay
);

// 2. USER BOOKING HISTORY
router.get(
  "/user/history",
  firebaseAuth,
  bookingController.getUserBookings
);

// 3. CREATE BOOKING (Dynamic param :pgId must stay below static /user routes)
router.post(
  "/:pgId", 
  firebaseAuth, 
  bookingController.createBooking
);

// 4. PAYMENT DONE / CHECK-IN
router.post(
  "/pay/:bookingId", 
  firebaseAuth, 
  bookingController.markPaymentDone
);

// ==========================================
// 👑 OWNER ROUTES
// ==========================================

// 5. OWNER BOOKINGS LIST
router.get(
  "/owner/bookings", 
  firebaseAuth, 
  bookingController.getOwnerBookings
);

// 6. OWNER APPROVE / REJECT
router.put(
  "/owner/bookings/:bookingId", 
  firebaseAuth, 
  bookingController.updateBookingStatus
);

// 7. OWNER ACTIVE TENANTS LIST
router.get(
  "/owner/tenants", 
  firebaseAuth, 
  bookingController.getActiveTenantsByOwner
);

module.exports = router;