const express = require("express");
const router = express.Router();

const firebaseAuth =
  require("../middlewares/authMiddleware");

const db = require("../db");

const ownerController =
  require("../controllers/ownerBookingController");

const {
  getOwnerBookings,
  updateBookingStatus,
  getActiveTenantsByOwner,
  getOwnerActiveTenants,
  getVacateRequests,
  approveVacateRequest,
  markRefundPaid,
  rejectVacateRequest,

  /* ✅ NEW */
  markFullPayment

} = ownerController;

//////////////////////////////////////////////////////
// ================= BOOKINGS =================
//////////////////////////////////////////////////////

router.get(
  "/bookings",
  firebaseAuth,
  getOwnerBookings
);

router.put(
  "/bookings/:bookingId",
  firebaseAuth,
  updateBookingStatus
);

//////////////////////////////////////////////////////
// ================= FULL PAYMENT =================
//////////////////////////////////////////////////////

router.post(
  "/mark-full-payment",
  firebaseAuth,
  markFullPayment
);

//////////////////////////////////////////////////////
// ================= TENANTS =================
//////////////////////////////////////////////////////

router.get(
  "/tenants",
  firebaseAuth,
  getActiveTenantsByOwner
);

router.get(
  "/tenants/active",
  firebaseAuth,
  getOwnerActiveTenants
);

//////////////////////////////////////////////////////
// ================= VACATE =================
//////////////////////////////////////////////////////

router.get(
  "/vacate/requests",
  firebaseAuth,
  getVacateRequests
);

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
// ================= PLAN =================
//////////////////////////////////////////////////////

router.get(
  "/current-plan",
  firebaseAuth,
  async (req, res) => {

    try {

      const ownerId = req.user.id;

      const [[user]] =
        await db.query(
          `
          SELECT
            plan,
            plan_expiry
          FROM users
          WHERE id=?
          `,
          [ownerId]
        );

      res.json({
        success: true,
        plan:
          user?.plan || "free",
        expiry:
          user?.plan_expiry || null
      });

    } catch (err) {

      console.error(
        "Get current plan error:",
        err
      );

      res.status(500).json({
        success: false,
        message: "Server error"
      });

    }

  }
);

//////////////////////////////////////////////////////
// ================= BECOME OWNER =================
//////////////////////////////////////////////////////

router.post(
  "/become-owner",
  firebaseAuth,
  async (req, res) => {

    try {

      const firebase_uid =
        req.user.firebase_uid;

      const [[user]] =
        await db.query(
          `
          SELECT
            id,
            role
          FROM users
          WHERE firebase_uid = ?
          `,
          [firebase_uid]
        );

      if (!user) {

        return res.status(404).json({
          success: false,
          message: "User not found"
        });

      }

      if (
        user.role === "owner" ||
        user.role === "pending_owner"
      ) {

        return res.json({
          success: false,
          message:
            "Already applied or already owner"
        });

      }

      await db.query(
        `
        UPDATE users
        SET role = 'pending_owner'
        WHERE id = ?
        `,
        [user.id]
      );

      res.json({
        success: true,
        message:
          "Request sent for approval"
      });

    } catch (err) {

      console.error(
        "Become Owner Error:",
        err
      );

      res.status(500).json({
        success: false,
        message: "Server error"
      });

    }

  }
);

module.exports = router;