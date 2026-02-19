const express = require("express");
const router = express.Router();

const firebaseAuth = require("../middlewares/auth");
const bookingController = require("../controllers/bookingController");

/* ======================================================
   🧑 TENANT ROUTES
====================================================== */

/* ➕ CREATE BOOKING */
router.post("/:pgId", firebaseAuth, bookingController.createBooking);

/* 📜 TENANT BOOKING HISTORY */
router.get(
  "/user/history",
  firebaseAuth,
  bookingController.getUserBookings
);

/* 🏠 USER ACTIVE STAY */
router.get(
  "/user/active-stay",
  firebaseAuth,
  bookingController.getMyActiveStay
);


/* ======================================================
   👑 OWNER BOOKING ROUTES
====================================================== */

/* 📥 GET ALL BOOKING REQUESTS */
router.get(
  "/owner/bookings",
  firebaseAuth,
  bookingController.getOwnerBookings
);

/* ✅ APPROVE / ❌ REJECT BOOKING */
router.put(
  "/owner/bookings/:bookingId",
  firebaseAuth,
  bookingController.updateBookingStatus
);


/* ======================================================
   👥 OWNER TENANTS ROUTES
====================================================== */

/* 👥 ACTIVE TENANTS LIST */
router.get(
  "/owner/tenants",
  firebaseAuth,
  bookingController.getActiveTenantsByOwner
);


module.exports = router;
