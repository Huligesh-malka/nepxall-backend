const db = require("../db");

/* =========================================
   👑 ADMIN → GET ALL REFUNDS
========================================= */
exports.getAllRefunds = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*, b.pg_id, b.owner_id, u.name, u.phone
      FROM refunds r
      JOIN bookings b ON b.id = r.booking_id
      JOIN users u ON u.id = r.user_id
      ORDER BY r.created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.approveRefund = async (req, res) => {
  try {
    const { id } = req.params;

    const [[refund]] = await db.query(
      `SELECT * FROM refunds WHERE id=?`,
      [id]
    );

    if (!refund) throw new Error("Refund not found");

    //////////////////////////////////////////////////////
    // ✅ UPDATE REFUND
    //////////////////////////////////////////////////////
    await db.query(
      `UPDATE refunds SET status='approved' WHERE id=?`,
      [id]
    );

    //////////////////////////////////////////////////////
    // 🔥 UPDATE PG_USERS (MATCH VACATE FLOW)
    //////////////////////////////////////////////////////
    await db.query(
      `UPDATE pg_users 
       SET vacate_status='approved'
       WHERE booking_id=?`,
      [refund.booking_id]
    );

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================================
   👑 ADMIN → MARK PAID (FULL CONTROL)
========================================= */
exports.markRefundPaidAdmin = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [[refund]] = await connection.query(
      `SELECT * FROM refunds WHERE id=?`,
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
    // 🔥 IF DEPOSIT → UPDATE VACATE
    //////////////////////////////////////////////////////
    if (refund.refund_type === "DEPOSIT") {
      await connection.query(
        `UPDATE pg_users 
         SET status='LEFT', vacate_status='completed'
         WHERE booking_id=?`,
        [refund.booking_id]
      );

      await connection.query(
        `UPDATE bookings 
         SET status='left'
         WHERE id=?`,
        [refund.booking_id]
      );
    }

    await connection.commit();

    res.json({ success: true });

  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    connection.release();
  }
};