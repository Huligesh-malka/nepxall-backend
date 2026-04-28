const db = require("../db");
const sendNotification = require("../utils/sendNotification"); // ✅ ADDED

/* =========================================
   👑 ADMIN → GET ONLY FULL REFUNDS
========================================= */
exports.getAllRefunds = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        r.*,

        /* ✅ Correct order_id from payments */
        p.order_id,

        b.pg_id,
        b.owner_id,
        b.room_type,

        u.name,
        u.phone,
        u.fcm_token AS user_fcm_token

      FROM refunds r

      JOIN bookings b 
        ON b.id = r.booking_id

      JOIN users u 
        ON u.id = r.user_id

      /* 🔥 Get order_id from payments */
      LEFT JOIN payments p 
        ON p.booking_id = r.booking_id
        AND p.status = 'paid'

      WHERE r.refund_type = 'FULL'

      ORDER BY r.created_at DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error("Refund fetch error:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

/* =========================================
   👑 ADMIN → APPROVE FULL REFUND
========================================= */
exports.approveRefund = async (req, res) => {
  try {
    const { id } = req.params;

    const [[refund]] = await db.query(
      `SELECT r.*, b.room_type, b.user_id 
       FROM refunds r
       JOIN bookings b ON b.id = r.booking_id
       WHERE r.id=?`,
      [id]
    );

    if (!refund) throw new Error("Refund not found");

    if (refund.refund_type !== "FULL") {
      throw new Error("Admin can only approve FULL refunds");
    }

    await db.query(
      `UPDATE refunds SET status='approved' WHERE id=?`,
      [id]
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
        "Refund Approved ✅",
        `Your refund of ₹${refund.amount} has been approved by admin.`
      );
    }

    // Insert in-app notification
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        refund.user_id,
        "Refund Approved ✅",
        `Your refund of ₹${refund.amount} for ${refund.room_type || "booking"} has been approved by admin.`,
        "refund_approved"
      ]
    );

    res.json({ 
      success: true, 
      message: "FULL refund approved",
      notification_sent: !!user?.fcm_token
    });

  } catch (err) {
    console.error("❌ APPROVE REFUND ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================================
   👑 ADMIN → REJECT FULL REFUND
========================================= */
exports.rejectRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { reject_reason } = req.body;

    const [[refund]] = await db.query(
      `SELECT r.*, b.room_type, b.user_id 
       FROM refunds r
       JOIN bookings b ON b.id = r.booking_id
       WHERE r.id=?`,
      [id]
    );

    if (!refund) throw new Error("Refund not found");

    if (refund.refund_type !== "FULL") {
      throw new Error("Admin can only reject FULL refunds");
    }

    await db.query(
      `UPDATE refunds SET status='rejected', reject_reason=? WHERE id=?`,
      [reject_reason || "No reason provided", id]
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
        "Refund Update ❌",
        `Your refund request for ${refund.room_type || "booking"} has been rejected. Reason: ${reject_reason || "Please contact support"}`
      );
    }

    // Insert in-app notification
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        refund.user_id,
        "Refund Update ❌",
        `Your refund request for ${refund.room_type || "booking"} has been rejected. Reason: ${reject_reason || "Please contact support"}`,
        "refund_rejected"
      ]
    );

    res.json({ 
      success: true, 
      message: "FULL refund rejected",
      notification_sent: !!user?.fcm_token
    });

  } catch (err) {
    console.error("❌ REJECT REFUND ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================================
   👑 ADMIN → COMPLETE FULL REFUND (FINAL FIX)
========================================= */
exports.markRefundCompletedAdmin = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    //////////////////////////////////////////////////////
    // ✅ GET REFUND WITH DETAILS
    //////////////////////////////////////////////////////
    const [[refund]] = await connection.query(
      `SELECT r.*, b.user_id, b.room_type, b.owner_id, b.pg_id
       FROM refunds r
       JOIN bookings b ON b.id = r.booking_id
       WHERE r.id=?`,
      [id]
    );

    if (!refund) throw new Error("Refund not found");

    if (refund.refund_type !== "FULL") {
      throw new Error("Admin can only process FULL refunds");
    }

    const bookingId = refund.booking_id;

    //////////////////////////////////////////////////////
    // ✅ UPDATE REFUND → COMPLETED
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE refunds SET status='completed' WHERE id=?`,
      [id]
    );

    //////////////////////////////////////////////////////
    // ✅ UPDATE BOOKINGS → LEFT
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE bookings 
       SET status='LEFT'
       WHERE id=?`,
      [bookingId]
    );

    //////////////////////////////////////////////////////
    // ✅ UPDATE PG_USERS → LEFT
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE pg_users 
       SET status='LEFT'
       WHERE booking_id=?`,
      [bookingId]
    );

    //////////////////////////////////////////////////////
    // ✅ COMMIT
    //////////////////////////////////////////////////////
    await connection.commit();

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
        "Refund Completed 💰",
        `Your refund of ₹${refund.amount} for ${refund.room_type || "booking"} has been completed.`
      );
    }

    // Insert in-app notification for user
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        refund.user_id,
        "Refund Completed 💰",
        `Your refund of ₹${refund.amount} for ${refund.room_type || "booking"} has been completed.`,
        "refund_completed"
      ]
    );

    //////////////////////////////////////////////////////
    // 🔔 SEND NOTIFICATION TO OWNER
    //////////////////////////////////////////////////////
    const [[owner]] = await db.query(
      "SELECT fcm_token FROM users WHERE id=?",
      [refund.owner_id]
    );

    if (owner?.fcm_token) {
      await sendNotification(
        owner.fcm_token,
        "Tenant Vacated 🚪",
        `Tenant has vacated the PG and refund has been processed for ${refund.room_type || "booking"}.`
      );
    }

    // Insert in-app notification for owner
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        refund.owner_id,
        "Tenant Vacated 🚪",
        `Tenant has vacated the PG and refund has been processed for ${refund.room_type || "booking"}.`,
        "tenant_vacated"
      ]
    );

    res.json({
      success: true,
      message: "FULL refund completed & user exited successfully",
      notifications_sent: {
        user: !!user?.fcm_token,
        owner: !!owner?.fcm_token
      }
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ FULL REFUND ERROR:", err);

    res.status(500).json({ message: err.message });

  } finally {
    connection.release();
  }
};

/* =========================================
   👑 ADMIN → GET ALL DEPOSIT REFUNDS
========================================= */
exports.getAllDepositRefunds = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        r.*,

        b.order_id,
        b.pg_id,
        b.owner_id,
        b.room_type,
        b.security_deposit,

        u.name AS tenant_name,
        u.phone AS tenant_phone,

        o.name AS owner_name,
        o.phone AS owner_phone,

        p.pg_name

      FROM refunds r

      JOIN bookings b 
        ON b.id = r.booking_id

      JOIN users u 
        ON u.id = r.user_id

      JOIN users o 
        ON o.id = b.owner_id

      JOIN pgs p 
        ON p.id = b.pg_id

      WHERE r.refund_type = 'DEPOSIT'

      ORDER BY r.created_at DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error("Deposit refund fetch error:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

/* =========================================
   👑 ADMIN → OVERRIDE DEPOSIT REFUND
========================================= */
exports.overrideDepositRefund = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { amount, status } = req.body;

    const [[refund]] = await connection.query(
      `SELECT r.*, b.user_id, b.room_type 
       FROM refunds r
       JOIN bookings b ON b.id = r.booking_id
       WHERE r.id=?`,
      [id]
    );

    if (!refund) throw new Error("Refund not found");

    if (refund.refund_type !== "DEPOSIT") {
      throw new Error("Admin can only override DEPOSIT refunds");
    }

    // Update refund with admin override
    await connection.query(
      `UPDATE refunds 
       SET amount=?, status=?, user_approval='accepted', admin_override=1, admin_override_date=NOW()
       WHERE id=?`,
      [amount, status, id]
    );

    await connection.commit();

    //////////////////////////////////////////////////////
    // 🔔 SEND NOTIFICATION TO USER
    //////////////////////////////////////////////////////
    const [[user]] = await db.query(
      "SELECT fcm_token FROM users WHERE id=?",
      [refund.user_id]
    );

    if (user?.fcm_token) {
      const message = status === "approved" 
        ? `Your deposit refund of ₹${amount} has been approved by admin override.`
        : `Your deposit refund has been updated to ${status} by admin.`;

      await sendNotification(
        user.fcm_token,
        "Refund Update 🔄",
        message
      );
    }

    // Insert in-app notification
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        refund.user_id,
        "Refund Update 🔄",
        status === "approved" 
          ? `Your deposit refund of ₹${amount} for ${refund.room_type || "booking"} has been approved by admin.`
          : `Your deposit refund for ${refund.room_type || "booking"} has been updated to ${status} by admin.`,
        "refund_updated"
      ]
    );

    res.json({
      success: true,
      message: `Deposit refund ${status} with amount ₹${amount}`
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ OVERRIDE REFUND ERROR:", err);
    res.status(500).json({ message: err.message });
  } finally {
    connection.release();
  }
};