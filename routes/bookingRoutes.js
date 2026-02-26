const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middlewares/auth");
const bookingController = require("../controllers/bookingController");

router.post("/:pgId", firebaseAuth, bookingController.createBooking);

router.get("/user/history", firebaseAuth, bookingController.getUserBookings);

router.post("/pay/:bookingId", firebaseAuth, bookingController.markPaymentDone);

router.get("/owner/bookings", firebaseAuth, bookingController.getOwnerBookings);

router.put("/owner/bookings/:bookingId", firebaseAuth, bookingController.updateBookingStatus);

router.get("/owner/tenants", firebaseAuth, bookingController.getActiveTenantsByOwner);

module.exports = router;