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

      /* ✅ GET ONLY LATEST BOOKING */
      JOIN (
          SELECT MAX(id) id
          FROM bookings
          WHERE owner_id = ?
          GROUP BY pg_id, user_id, check_in_date, room_type
      ) latest ON latest.id = b.id

      JOIN pgs p ON p.id = b.pg_id

      ORDER BY b.created_at DESC
      `,
      [owner.id]
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
    const { status, reject_reason, room_id, exit_date } = req.body;

    const owner = await getOwner(req.user.firebase_uid);
    if (!owner) throw new Error("Not an owner");

    /* 🚨 BLOCK IF NOT VERIFIED */
    if (status === "approved" && owner.owner_verification_status !== "verified") {
      await connection.rollback();
      return res.status(403).json({
        code: "ONBOARDING_PENDING",
        message: "Complete verification before approving booking"
      });
    }

    /* 🔒 VALIDATE BOOKING */
    const [[booking]] = await connection.query(
      `SELECT * FROM bookings WHERE id = ? AND owner_id = ?`,
      [bookingId, owner.id]
    );

    if (!booking) throw new Error("Not your booking");

    /* ✅ UPDATE BOOKING STATUS */
    await connection.query(
      `UPDATE bookings
       SET status = ?, reject_reason = ?
       WHERE id = ?`,
      [status, reject_reason || null, bookingId]
    );

    /* ======================================================
       🟢 IF APPROVED → ADD TO pg_users
    ====================================================== */
    if (status === "approved") {

      const [[existing]] = await connection.query(
        `SELECT id FROM pg_users
         WHERE user_id = ? AND pg_id = ? AND status = 'ACTIVE'`,
        [booking.user_id, booking.pg_id]
      );

      if (!existing) {
        await connection.query(
          `INSERT INTO pg_users
           (owner_id, pg_id, user_id, room_no, join_date, exit_date, status)
           VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
          [
            owner.id,
            booking.pg_id,
            booking.user_id,
            room_id || null,
            booking.check_in_date,
            exit_date || null
          ]
        );
      }
    }

    await connection.commit();

    res.json({ success: true });

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

    // ✅ Get owner
    const owner = await getOwner(req.user.firebase_uid);
    if (!owner) throw new Error("Not an owner");

    // ✅ Get booking
    const [[booking]] = await connection.query(
      "SELECT * FROM bookings WHERE id=? AND owner_id=?",
      [bookingId, owner.id]
    );

    if (!booking) throw new Error("Booking not found");

    // ✅ Get deposit
    const deposit = Number(booking.security_deposit) || 0;

    // ✅ Calculate refund
    let refundAmount = deposit - damage_amount - pending_dues;
    if (refundAmount < 0) refundAmount = 0;

    // ✅ Update refund table
    await connection.query(
      `UPDATE refunds 
       SET 
         amount=?, 
         status='approved',
         damage_amount=?,
         reason = CONCAT(reason, ' | Damage: ₹', ?, ' | Dues: ₹', ?)
       WHERE booking_id=?`,
      [refundAmount, damage_amount, damage_amount, pending_dues, bookingId]
    );

    // ✅ Update pg_users → mark LEFT
    await connection.query(
      `UPDATE pg_users 
       SET status='LEFT', vacate_status='completed'
       WHERE user_id=? AND pg_id=?`,
      [booking.user_id, booking.pg_id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Vacate approved & refund calculated",
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
        r.status AS refund_status

      FROM pg_users pu

      -- ✅ GET ONLY LATEST PAID BOOKING
      JOIN bookings b 
        ON b.id = (
          SELECT MAX(id)
          FROM bookings 
          WHERE user_id = pu.user_id 
          AND pg_id = pu.pg_id
          AND payment_status = 'paid'
        )

      JOIN users u ON u.id = pu.user_id
      JOIN pgs p ON p.id = pu.pg_id

      -- ✅ REFUND DATA
      LEFT JOIN refunds r ON r.booking_id = b.id

      WHERE pu.owner_id = ?
      AND pu.vacate_status = 'requested'
      `,
      [owner.id]
    );

    res.json(rows);

  } catch (err) {
    console.error("❌ VACATE FETCH ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};