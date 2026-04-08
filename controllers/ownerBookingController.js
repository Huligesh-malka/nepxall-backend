const db = require("../db");

/* ======================================================
   🧠 GET OWNER FROM FIREBASE UID
====================================================== */
const getOwner = async (firebase_uid) => {
  const [rows] = await db.query(
    `SELECT id, name, owner_verification_status
     FROM users 
     WHERE firebase_uid = ? AND role = 'owner'
     LIMIT 1`,
    [firebase_uid]
  );

  return rows[0] || null;
};

/* ======================================================
   📥 OWNER → GET BOOKINGS
====================================================== */
exports.getOwnerBookings = async (req, res) => {
  try {
    const owner = await getOwner(req.user.firebase_uid);

    if (!owner) {
      return res.status(403).json({ message: "Not an owner" });
    }

    //////////////////////////////////////////////////////
    // 🔥 STEP 1: AUTO EXPIRE OLD BOOKINGS (24 HOURS)
    //////////////////////////////////////////////////////
    await db.query(`
      UPDATE bookings
      SET status = 'expired'
      WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL 24 HOUR
    `);

    //////////////////////////////////////////////////////
    // 📥 STEP 2: FETCH BOOKINGS (ONLY VALID ONES)
    //////////////////////////////////////////////////////
    const [rows] = await db.query(
      `
      SELECT 
          b.id,
          b.pg_id,
          b.check_in_date,
          b.room_type,
          b.status,
          b.created_at,

          p.pg_name,

          /* ✅ SNAPSHOT TENANT NAME */
          b.name AS tenant_name,

          /* 🔒 SHOW PHONE ONLY AFTER APPROVAL */
          CASE 
            WHEN b.status IN ('approved','confirmed') 
            THEN b.phone
            ELSE NULL
          END AS tenant_phone

      FROM bookings b

      /* ✅ ONLY LATEST BOOKING PER USER */
      JOIN (
          SELECT MAX(id) id
          FROM bookings
          WHERE owner_id = ?
          GROUP BY pg_id, user_id
      ) latest ON latest.id = b.id

      JOIN pgs p ON p.id = b.pg_id

      /* 🔥 FILTER EXPIRED + OLD PENDING */
      WHERE b.owner_id = ?
      AND (
        b.status != 'pending'
        OR b.created_at >= NOW() - INTERVAL 24 HOUR
      )

      ORDER BY b.created_at DESC
      `,
      [owner.id, owner.id]
    );

    res.json(rows);

  } catch (err) {
    console.error("❌ GET OWNER BOOKINGS:", err);
    res.status(500).json({ message: "Server error" });
  }
};
/* ======================================================
   ✅ OWNER → APPROVE / REJECT BOOKING
====================================================== */
exports.updateBookingStatus = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { bookingId } = req.params;
    const { status, reject_reason } = req.body;

    const owner = await getOwner(req.user.firebase_uid);
    if (!owner) throw new Error("Not an owner");

    // 🚨 VERIFY OWNER
    if (status === "approved" && owner.owner_verification_status !== "verified") {
      await connection.rollback();
      return res.status(403).json({
        message: "Complete verification before approving booking"
      });
    }

    // 🔒 GET BOOKING
    const [[booking]] = await connection.query(
      `SELECT * FROM bookings WHERE id = ? AND owner_id = ?`,
      [bookingId, owner.id]
    );

    if (!booking) throw new Error("Booking not found");

    // ✅ UPDATE ONLY STATUS (NO pg_users HERE)
    await connection.query(
      `UPDATE bookings
       SET status = ?, reject_reason = ?
       WHERE id = ?`,
      [status, reject_reason || null, bookingId]
    );

    await connection.commit();

    res.json({ success: true, message: "Booking updated successfully" });

  } catch (err) {
    await connection.rollback();
    console.error("❌ UPDATE BOOKING:", err);
    res.status(500).json({ message: err.message });
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

    //////////////////////////////////////////////////////
    // ✅ OWNER CHECK
    //////////////////////////////////////////////////////
    const owner = await getOwner(req.user.firebase_uid);
    if (!owner) throw new Error("Not an owner");

    //////////////////////////////////////////////////////
    // ✅ BOOKING CHECK
    //////////////////////////////////////////////////////
    const [[booking]] = await connection.query(
      "SELECT * FROM bookings WHERE id=? AND owner_id=?",
      [bookingId, owner.id]
    );

    if (!booking) throw new Error("Booking not found");

    //////////////////////////////////////////////////////
    // ✅ GET REFUND
    //////////////////////////////////////////////////////
    const [[refund]] = await connection.query(
      "SELECT * FROM refunds WHERE booking_id=? AND refund_type='DEPOSIT'",
      [bookingId]
    );

    if (!refund) throw new Error("Vacate request not found");

    //////////////////////////////////////////////////////
    // 💰 CALCULATE REFUND
    //////////////////////////////////////////////////////
    const deposit = Number(booking.security_deposit) || 0;
    let refundAmount = deposit - damage_amount - pending_dues;
    if (refundAmount < 0) refundAmount = 0;

    //////////////////////////////////////////////////////
    // 🔥 IMPORTANT FIX: HANDLE RE-APPROVAL
    //////////////////////////////////////////////////////
    let newStatus = "approved";
    let newUserApproval = "pending";

    // ✅ If user rejected earlier → allow re-approval
    if (refund.user_approval === "rejected") {
      newStatus = "approved";
      newUserApproval = "pending"; // reset again
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

    //////////////////////////////////////////////////////
    // ❗ DO NOT MARK LEFT HERE (IMPORTANT FIX)
    //////////////////////////////////////////////////////
    // ❌ REMOVE THIS BLOCK (was causing issue)
    /*
    UPDATE pg_users SET status='LEFT'
    */

    //////////////////////////////////////////////////////
    // ✅ COMMIT
    //////////////////////////////////////////////////////
    await connection.commit();

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
        p.pg_name,
        u.name AS user_name,

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
      `SELECT r.*, b.owner_id 
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

    const { bookingId } = req.params;

    //////////////////////////////////////////////////////
    // ✅ OWNER CHECK
    //////////////////////////////////////////////////////
    const owner = await getOwner(req.user.firebase_uid);
    if (!owner) {
      return res.status(403).json({ message: "Not an owner" });
    }

    //////////////////////////////////////////////////////
    // ✅ GET REFUND + BOOKING
    //////////////////////////////////////////////////////
    const [[refund]] = await connection.query(
      `SELECT r.*, b.owner_id, b.user_id, b.pg_id
       FROM refunds r
       JOIN bookings b ON b.id = r.booking_id
       WHERE r.booking_id=? FOR UPDATE`,
      [bookingId]
    );

    if (!refund) {
      return res.status(404).json({ message: "Refund not found" });
    }

    //////////////////////////////////////////////////////
    // 🔒 SECURITY CHECK
    //////////////////////////////////////////////////////
    if (refund.owner_id !== owner.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    //////////////////////////////////////////////////////
    // 🔥 FIXED VALIDATION (VERY IMPORTANT)
    //////////////////////////////////////////////////////
    const userApproval = (refund.user_approval || "").toString().trim().toLowerCase();

    if (userApproval !== "accepted") {
      return res.status(400).json({
        message: `User has not accepted refund yet (current: ${refund.user_approval})`
      });
    }

    if (refund.status === "paid") {
      return res.status(400).json({
        message: "Refund already paid"
      });
    }

    if (refund.status !== "pending") {
      return res.status(400).json({
        message: `Invalid refund state: ${refund.status}`
      });
    }

    //////////////////////////////////////////////////////
    // 💰 MARK REFUND AS PAID
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE refunds 
       SET status='paid'
       WHERE booking_id=?`,
      [bookingId]
    );

    //////////////////////////////////////////////////////
    // 🏠 MARK USER LEFT
    //////////////////////////////////////////////////////
    const [pgUserUpdate] = await connection.query(
      `UPDATE pg_users 
       SET 
         status='LEFT',
         vacate_status='completed'
       WHERE booking_id=?`,
      [bookingId]
    );

    if (pgUserUpdate.affectedRows === 0) {
      await connection.query(
        `UPDATE pg_users 
         SET 
           status='LEFT',
           vacate_status='completed'
         WHERE user_id=? 
         AND pg_id=? 
         ORDER BY id DESC 
         LIMIT 1`,
        [refund.user_id, refund.pg_id]
      );
    }

    //////////////////////////////////////////////////////
    // 📦 UPDATE BOOKINGS
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE bookings 
       SET status='left'
       WHERE id=?`,
      [bookingId]
    );

    //////////////////////////////////////////////////////
    // ✅ COMMIT
    //////////////////////////////////////////////////////
    await connection.commit();

    res.json({
      success: true,
      message: "Refund paid & user vacated successfully"
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ MARK PAID ERROR:", err);
    res.status(500).json({ message: err.message });
  } finally {
    connection.release();
  }
};