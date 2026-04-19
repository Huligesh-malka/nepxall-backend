const db = require("../db");

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

        u.name,
        u.phone

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
      `SELECT * FROM refunds WHERE id=?`,
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

    res.json({ success: true, message: "FULL refund approved" });

  } catch (err) {
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
    // ✅ GET REFUND
    //////////////////////////////////////////////////////
    const [[refund]] = await connection.query(
      `SELECT * FROM refunds WHERE id=?`,
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
    // ✅ UPDATE BOOKINGS → LEFT (🔥 FIXED HERE)
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

    res.json({
      success: true,
      message: "FULL refund completed & user exited successfully"
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ FULL REFUND ERROR:", err);

    res.status(500).json({ message: err.message });

  } finally {
    connection.release();
  }
};