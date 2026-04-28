const db = require("../db");
const { decrypt } = require("../utils/encryption");
const sendNotification = require("../utils/sendNotification"); // ✅ ADDED

/* ======================================================
   🧠 GET OWNER FROM FIREBASE UID
====================================================== */
const getOwner = async (firebase_uid) => {
  const [rows] = await db.query(
    `SELECT id, name, owner_verification_status, fcm_token
     FROM users 
     WHERE firebase_uid = ? AND role = 'owner'
     LIMIT 1`,
    [firebase_uid]
  );

  return rows[0] || null;
};

/* ======================================================
   📥 OWNER → GET ALL BOOKINGS (PERMANENT DATA)
====================================================== */
exports.getOwnerBookings = async (req, res) => {
  try {
    const owner = await getOwner(req.user.firebase_uid);

    if (!owner) {
      return res.status(403).json({
        success: false,
        message: "Not an owner"
      });
    }

    await db.query(`
      UPDATE bookings
      SET status = 'expired'
      WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL 24 HOUR
    `);

    const [rows] = await db.query(
      `
      SELECT 
          b.id,
          b.pg_id,
          b.check_in_date,
          b.room_type,
          b.status,
          b.created_at,

          b.owner_amount,
          b.owner_settlement,
          b.admin_settlement,
          b.rent_amount,
          b.security_deposit,

          p.pg_name,

          b.name AS tenant_name,

          CASE 
            WHEN b.status IN ('approved','confirmed') 
            THEN b.phone
            ELSE NULL
          END AS tenant_phone

      FROM bookings b
      JOIN pgs p ON p.id = b.pg_id

      WHERE b.owner_id = ?

      ORDER BY b.created_at DESC
      `,
      [owner.id]
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows || []
    });

  } catch (err) {
    console.error("GET OWNER BOOKINGS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

/* ======================================================
   ✅ OWNER → APPROVE / REJECT BOOKING (FINAL VERSION)
====================================================== */
exports.updateBookingStatus = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { bookingId } = req.params;
    const { status, reject_reason } = req.body;

    const owner = await getOwner(req.user.firebase_uid);
    if (!owner) throw new Error("Not an owner");

    //////////////////////////////////////////////////////
    // ✅ VALID STATUS CHECK
    //////////////////////////////////////////////////////
    const allowedStatus = ["approved", "rejected"];

    if (!allowedStatus.includes(status)) {
      throw new Error("Invalid status");
    }

    //////////////////////////////////////////////////////
    // 🔒 GET BOOKING WITH USER DETAILS
    //////////////////////////////////////////////////////
    const [[booking]] = await connection.query(
      `SELECT b.*, u.fcm_token as user_fcm_token, u.name as user_name
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       WHERE b.id = ? AND b.owner_id = ?`,
      [bookingId, owner.id]
    );

    if (!booking) throw new Error("Booking not found");

    //////////////////////////////////////////////////////
    // ❌ BLOCK EXPIRED BOOKING (VERY IMPORTANT)
    //////////////////////////////////////////////////////
    if (booking.status === "expired") {
      throw new Error("Cannot approve expired booking");
    }

    //////////////////////////////////////////////////////
    // ❌ BLOCK ALREADY PROCESSED
    //////////////////////////////////////////////////////
    if (["approved", "rejected", "cancelled"].includes(booking.status)) {
      throw new Error(`Booking already ${booking.status}`);
    }

    //////////////////////////////////////////////////////
    // 🚨 OWNER VERIFICATION CHECK
    //////////////////////////////////////////////////////
    if (status === "approved" && owner.owner_verification_status !== "verified") {
      throw new Error("Complete verification before approving booking");
    }

    //////////////////////////////////////////////////////
    // 🧠 AUTO EXPIRE CHECK (SAFETY)
    //////////////////////////////////////////////////////
    const createdAt = new Date(booking.created_at);
    const now = new Date();
    const diffHours = (now - createdAt) / (1000 * 60 * 60);

    if (booking.status === "pending" && diffHours > 24) {
      await connection.query(
        `UPDATE bookings SET status='expired' WHERE id=?`,
        [bookingId]
      );

      throw new Error("Booking expired automatically");
    }

    //////////////////////////////////////////////////////
    // ✅ UPDATE STATUS
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE bookings
       SET status = ?, reject_reason = ?
       WHERE id = ?`,
      [status, reject_reason || null, bookingId]
    );

    await connection.commit();

    //////////////////////////////////////////////////////
    // 🔔 SEND NOTIFICATION TO USER
    //////////////////////////////////////////////////////
    if (booking.user_fcm_token) {
      if (status === "approved") {
        await sendNotification(
          booking.user_fcm_token,
          "Booking Approved ✅",
          `Your booking for ${booking.room_type} has been approved by the owner`
        );
      } else if (status === "rejected") {
        await sendNotification(
          booking.user_fcm_token,
          "Booking Update 🔄",
          `Your booking for ${booking.room_type} was not approved. ${reject_reason || "Please contact owner for details"}`
        );
      }
    }

    // Insert in-app notification
    const notificationTitle = status === "approved" ? "Booking Approved ✅" : "Booking Update 🔄";
    const notificationMessage = status === "approved"
      ? `Your booking for ${booking.room_type} has been approved by the owner`
      : `Your booking for ${booking.room_type} was not approved. ${reject_reason || "Please contact owner for details"}`;

    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [booking.user_id, notificationTitle, notificationMessage, "booking_update"]
    );

    res.json({
      success: true,
      message: `Booking ${status} successfully`
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ UPDATE BOOKING:", err);

    res.status(400).json({
      success: false,
      message: err.message
    });

  } finally {
    connection.release();
  }
};

/* ======================================================
   👥 OWNER → ACTIVE TENANTS
====================================================== */
exports.getActiveTenantsByOwner = async (req, res) => {
  try {
    const owner = await getOwner(req.user.firebase_uid);
    if (!owner) return res.status(403).json({ message: "Not an owner" });

    const [rows] = await db.query(
      `SELECT
         pu.id,
         pu.join_date,
         pu.exit_date,
         u.name,
         u.phone,
         p.pg_name
       FROM pg_users pu
       JOIN users u ON u.id = pu.user_id
       JOIN pgs p ON p.id = pu.pg_id
       WHERE pu.owner_id = ? AND pu.status = 'ACTIVE'`,
      [owner.id]
    );

    res.json(rows);

  } catch (err) {
    console.error("❌ ACTIVE TENANTS:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.approveVacateRequest = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { bookingId } = req.params;
    const { damage_amount = 0, pending_dues = 0 } = req.body;

    const owner = await getOwner(req.user.firebase_uid);
    if (!owner) throw new Error("Not an owner");

    const [[booking]] = await connection.query(
      "SELECT * FROM bookings WHERE id=? AND owner_id=?",
      [bookingId, owner.id]
    );

    if (!booking) throw new Error("Booking not found");

    const [[refund]] = await connection.query(
      "SELECT * FROM refunds WHERE booking_id=? AND refund_type='DEPOSIT'",
      [bookingId]
    );

    if (!refund) throw new Error("Vacate request not found");

    const deposit = Number(booking.security_deposit) || 0;
    let refundAmount = deposit - damage_amount - pending_dues;
    if (refundAmount < 0) refundAmount = 0;

    let newStatus = "approved";
    let newUserApproval = "pending";

    // ✅ If user rejected earlier → allow re-approval
    if (refund.user_approval === "rejected") {
      newStatus = "approved";
      newUserApproval = "pending";
    }

    // ✅ If already accepted → don't allow re-approve
    if (refund.user_approval === "accepted") {
      throw new Error("User already accepted. Cannot re-approve.");
    }

    //////////////////////////////////////////////////////
    // ✅ UPDATE REFUND
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE refunds 
       SET 
         amount=?, 
         status=?, 
         user_approval=?,
         damage_amount=?,
         reason = CONCAT('Vacate deposit refund | Damage: ₹', ?, ' | Dues: ₹', ?)
       WHERE booking_id=?`,
      [
        refundAmount,
        newStatus,
        newUserApproval,
        damage_amount,
        damage_amount,
        pending_dues,
        bookingId
      ]
    );

    await connection.commit();

    //////////////////////////////////////////////////////
    // 🔔 GET USER FCM TOKEN FOR NOTIFICATION
    //////////////////////////////////////////////////////
    const [[user]] = await db.query(
      "SELECT fcm_token FROM users WHERE id=?",
      [booking.user_id]
    );

    // 🔔 SEND PUSH NOTIFICATION TO USER
    if (user?.fcm_token) {
      await sendNotification(
        user.fcm_token,
        "Vacate Request Approved ✅",
        `Your vacate request has been approved. Refund amount: ₹${refundAmount}`
      );
    }

    // Insert in-app notification
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        booking.user_id,
        "Vacate Request Approved ✅",
        `Your vacate request has been approved. Refund amount: ₹${refundAmount}`,
        "vacate_approved"
      ]
    );

    res.json({
      success: true,
      message: "Vacate approved successfully",
      refundAmount
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ VACATE APPROVE ERROR:", err);
    res.status(500).json({ message: err.message });
  } finally {
    connection.release();
  }
};

// ✅ MASK FUNCTIONS (ADD ABOVE OR BELOW)
function maskAccount(acc) {
  if (!acc) return "";
  return "XXXXXX" + acc.slice(-4);
}

function maskIFSC(ifsc) {
  if (!ifsc) return "";
  return ifsc.slice(0, 4) + "****";
}

function maskUPI(upi) {
  if (!upi) return "";
  const parts = upi.split("@");
  if (parts.length !== 2) return "****";
  return parts[0].slice(0, 2) + "***@" + parts[1];
}

exports.getVacateRequests = async (req, res) => {
  try {
    const owner = await getOwner(req.user.firebase_uid);

    if (!owner) {
      return res.status(403).json({ message: "Not an owner" });
    }

    const [rows] = await db.query(
      `
      SELECT 
        b.id AS booking_id,
        r.id AS id, 
        p.pg_name,
        u.name AS user_name,
        u.fcm_token AS user_fcm_token,
        u.id AS user_id,

        pu.move_out_date,

        b.security_deposit,

        r.amount AS refund_amount,
        r.status AS refund_status,
        r.user_approval,

        r.reason,
        r.upi_id,
        r.account_number,
        r.ifsc_code,
        r.damage_amount,

        r.created_at

      FROM refunds r
      JOIN bookings b ON b.id = r.booking_id
      JOIN users u ON u.id = b.user_id
      JOIN pgs p ON p.id = b.pg_id
      LEFT JOIN pg_users pu 
        ON pu.user_id = b.user_id 
        AND pu.pg_id = b.pg_id

      WHERE b.owner_id = ?
      AND r.refund_type = 'DEPOSIT'

      ORDER BY r.created_at DESC
      `,
      [owner.id]
    );

    //////////////////////////////////////////////////////
    // 🔐 DECRYPT + FINAL SECURE MASK LOGIC
    //////////////////////////////////////////////////////
    rows.forEach(r => {
      let acc = null;
      let ifsc = null;
      let upi = null;

      try {
        acc = r.account_number ? decrypt(r.account_number) : null;
        ifsc = r.ifsc_code ? decrypt(r.ifsc_code) : null;
        upi = r.upi_id ? decrypt(r.upi_id) : null;
      } catch {
        acc = r.account_number;
        ifsc = r.ifsc_code;
        upi = r.upi_id;
      }

      // ✅ SHOW FULL only when BOTH conditions true
      if (
        r.refund_status === "approved" &&
        r.user_approval === "accepted"
      ) {
        r.account_number = acc;
        r.ifsc_code = ifsc;
        r.upi_id = upi;
      }
      // 🔒 AFTER PAYMENT → ALWAYS MASK
      else if (r.refund_status === "completed") {
        r.account_number = maskAccount(acc);
        r.ifsc_code = maskIFSC(ifsc);
        r.upi_id = maskUPI(upi);
      }
      // 🔒 DEFAULT → MASK
      else {
        r.account_number = maskAccount(acc);
        r.ifsc_code = maskIFSC(ifsc);
        r.upi_id = maskUPI(upi);
      }
    });

    res.json(rows);

  } catch (err) {
    console.error("❌ VACATE FETCH ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

exports.rejectVacateRequest = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const owner = await getOwner(req.user.firebase_uid);
    if (!owner) return res.status(403).json({ message: "Not owner" });

    const [[refund]] = await db.query(
      `SELECT r.*, b.owner_id, b.user_id 
       FROM refunds r
       JOIN bookings b ON b.id = r.booking_id
       WHERE r.booking_id=?`,
      [bookingId]
    );

    if (!refund) {
      return res.status(404).json({ message: "Refund not found" });
    }

    if (refund.owner_id !== owner.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await db.query(
      `UPDATE refunds 
       SET status='rejected'
       WHERE booking_id=?`,
      [bookingId]
    );

    //////////////////////////////////////////////////////
    // 🔔 SEND NOTIFICATION TO USER
    //////////////////////////////////////////////////////
    const [[user]] = await db.query(
      "SELECT fcm_token FROM users WHERE id=?",
      [refund.user_id]
    );

    if (user?.fcm_token) {
      await sendNotification(
        user.fcm_token,
        "Vacate Request Rejected ❌",
        "Your vacate request has been rejected. Please contact the owner for more details."
      );
    }

    // Insert in-app notification
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        refund.user_id,
        "Vacate Request Rejected ❌",
        "Your vacate request has been rejected. Please contact the owner for more details.",
        "vacate_rejected"
      ]
    );

    res.json({ success: true, message: "Refund rejected by owner" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.markRefundPaid = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    //////////////////////////////////////////////////////
    // 🔐 OWNER VALIDATION
    //////////////////////////////////////////////////////
    const owner = await getOwner(req.user.firebase_uid);
    if (!owner) throw new Error("Not an owner");

    //////////////////////////////////////////////////////
    // 📦 GET REFUND + BOOKING
    //////////////////////////////////////////////////////
    const [[refund]] = await connection.query(
      `SELECT r.*, b.owner_id, b.user_id, b.pg_id
       FROM refunds r
       JOIN bookings b ON b.id = r.booking_id
       WHERE r.id=?`,
      [id]
    );

    if (!refund) throw new Error("Refund not found");

    //////////////////////////////////////////////////////
    // 🔒 SECURITY CHECK
    //////////////////////////////////////////////////////
    if (refund.owner_id !== owner.id) {
      throw new Error("Unauthorized");
    }

    const bookingId = refund.booking_id;

    //////////////////////////////////////////////////////
    // ✅ VALIDATION
    //////////////////////////////////////////////////////
    const userApproval = (refund.user_approval || "").toLowerCase();
    const status = (refund.status || "").toLowerCase();

    if (userApproval !== "accepted") {
      throw new Error("User has not accepted refund yet");
    }

    //////////////////////////////////////////////////////
    // ✅ ALREADY COMPLETED FIX
    //////////////////////////////////////////////////////
    if (status === "completed") {
      await connection.commit();

      return res.json({
        success: true,
        message: "Already paid",
        status: "completed"
      });
    }

    if (!["pending", "approved"].includes(status)) {
      throw new Error("Invalid refund state");
    }

    //////////////////////////////////////////////////////
    // 💰 UPDATE REFUND (FIXED)
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE refunds 
       SET status='completed'
       WHERE id=?`,
      [id]
    );

    //////////////////////////////////////////////////////
    // 🏠 UPDATE PG_USERS
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE pg_users 
       SET status='LEFT',
           vacate_status='completed'
       WHERE booking_id=?`,
      [bookingId]
    );

    //////////////////////////////////////////////////////
    // 📦 UPDATE BOOKINGS
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE bookings 
       SET status='left'
       WHERE id=?`,
      [bookingId]
    );

    await connection.commit();

    //////////////////////////////////////////////////////
    // 🔔 GET USER FCM TOKEN
    //////////////////////////////////////////////////////
    const [[user]] = await db.query(
      "SELECT fcm_token FROM users WHERE id=?",
      [refund.user_id]
    );

    // 🔔 SEND PUSH NOTIFICATION TO USER
    if (user?.fcm_token) {
      await sendNotification(
        user.fcm_token,
        "Refund Processed 💰",
        `Your refund of ₹${refund.amount} has been sent to your account.`
      );
    }

    // Insert in-app notification
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        refund.user_id,
        "Refund Processed 💰",
        `Your refund of ₹${refund.amount} has been sent to your account.`,
        "refund_paid"
      ]
    );

    //////////////////////////////////////////////////////
    // 🔥 RESPONSE (IMPORTANT FOR FRONTEND)
    //////////////////////////////////////////////////////
    res.json({
      success: true,
      message: "Refund completed successfully",
      status: "completed",
      booking_id: bookingId
    });

  } catch (err) {
    await connection.rollback();

    console.error("❌ MARK COMPLETED ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });

  } finally {
    connection.release();
  }
};

exports.getOwnerActiveTenants = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const [rows] = await db.query(`
      SELECT 
        pu.id AS pg_user_id,
        pu.status,

        u.id AS user_id,
        u.name,
        u.phone,
        u.email,

        p.id AS pg_id,
        p.pg_name,

        pr.room_no,

        b.id AS booking_id,
        b.order_id,
        b.room_type,
        b.food_preference,

        /* ✅ CORRECT OWNER AMOUNT (NO AGREEMENT) */
        (
          COALESCE(b.rent_amount, 0) +
          COALESCE(b.security_deposit, 0) +
          COALESCE(b.maintenance_amount, 0)
        ) AS owner_amount,

        b.rent_amount,
        b.security_deposit,
        b.maintenance_amount,

        pc.checkin_time,

        b.status AS booking_status,
        b.created_at

      FROM pg_users pu

      JOIN users u ON u.id = pu.user_id
      JOIN pgs p ON p.id = pu.pg_id

      LEFT JOIN bookings b 
        ON b.id = pu.booking_id

      LEFT JOIN pg_rooms pr 
        ON pr.id = pu.room_id

      LEFT JOIN pg_checkins pc
        ON pc.booking_id = pu.booking_id

      WHERE pu.owner_id = ? 
      AND pu.status = 'ACTIVE'

      ORDER BY pc.checkin_time DESC
    `, [ownerId]);

    res.json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (err) {
    console.error("ACTIVE TENANTS ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

//////////////////////////////////////////////////////
// MARK FULL PAYMENT RECEIVED
//////////////////////////////////////////////////////
exports.markFullPayment = async (req, res) => {
  try {
    const {
      booking_id,
      payment_mode
    } = req.body;

    // Get booking details for notification
    const [[booking]] = await db.query(
      `SELECT b.user_id, b.room_type, b.rent_amount
       FROM bookings b
       WHERE b.id = ?`,
      [booking_id]
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    await db.query(
      `
      UPDATE bookings
      SET
        full_payment_completed = 1,
        remaining_payment_received = 1,
        remaining_paid_date = NOW(),
        remaining_payment_mode = ?
      WHERE id = ?
      `,
      [
        payment_mode || "CASH",
        booking_id
      ]
    );

    //////////////////////////////////////////////////////
    // 🔔 SEND NOTIFICATION TO USER
    //////////////////////////////////////////////////////
    const [[user]] = await db.query(
      "SELECT fcm_token FROM users WHERE id=?",
      [booking.user_id]
    );

    if (user?.fcm_token) {
      await sendNotification(
        user.fcm_token,
        "Payment Received 💳",
        `Full payment for ${booking.room_type} has been received.`
      );
    }

    // Insert in-app notification
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        booking.user_id,
        "Payment Received 💳",
        `Full payment for ${booking.room_type} has been received.`,
        "payment_received"
      ]
    );

    res.json({
      success: true,
      message: "Full payment updated"
    });

  } catch (err) {
    console.error("FULL PAYMENT ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update payment"
    });
  }
};