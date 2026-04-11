const db = require("../db");

/* =========================================
   👑 ADMIN → GET ONLY FULL REFUNDS
========================================= */
exports.getAllRefunds = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*, b.pg_id, b.owner_id, u.name, u.phone
      FROM refunds r
      JOIN bookings b ON b.id = r.booking_id
      JOIN users u ON u.id = r.user_id
      WHERE r.refund_type = 'FULL'
      ORDER BY r.created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
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

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.markRefundPaidAdmin = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [[refund]] = await connection.query(
      `SELECT r.*, b.pg_id 
       FROM refunds r
       JOIN bookings b ON b.id = r.booking_id
       WHERE r.id=?`,
      [id]
    );

    if (!refund) throw new Error("Refund not found");

    //////////////////////////////////////////////////////
    // ✅ UPDATE REFUND
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE refunds SET status='paid' WHERE id=?`,
      [id]
    );

    //////////////////////////////////////////////////////
    // 🔥 STRONG UPDATE (FIXED)
    //////////////////////////////////////////////////////
    if (refund.refund_type === "DEPOSIT") {

      const [result1] = await connection.query(
        `UPDATE pg_users 
         SET status='LEFT', vacate_status='completed'
         WHERE booking_id=?`,
        [refund.booking_id]
      );

      const [result2] = await connection.query(
        `UPDATE bookings 
         SET status='left'
         WHERE id=?`,
        [refund.booking_id]
      );

      console.log("PG_USERS updated:", result1.affectedRows);
      console.log("BOOKINGS updated:", result2.affectedRows);
    }

    await connection.commit();

    res.json({ success: true });

  } catch (err) {
    await connection.rollback();
    console.error("❌ ADMIN PAID ERROR:", err);
    res.status(500).json({ message: err.message });
  } finally {
    connection.release();
  }
};

/* =========================================
   👑 ADMIN → REJECT FULL REFUND
========================================= */
exports.rejectRefund = async (req, res) => {
  try {
    const { id } = req.params;

    const [[refund]] = await db.query(
      `SELECT * FROM refunds WHERE id=?`,
      [id]
    );

    if (!refund) throw new Error("Refund not found");

    if (refund.refund_type !== "FULL") {
      throw new Error("Admin can only reject FULL refunds");
    }

    await db.query(
      `UPDATE refunds SET status='rejected' WHERE id=?`,
      [id]
    );

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};