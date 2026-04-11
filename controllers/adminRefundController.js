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

    res.json({ success: true, message: "FULL refund approved" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================================
   👑 ADMIN → MARK FULL REFUND PAID
========================================= */
exports.markRefundPaidAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const [[refund]] = await db.query(
      `SELECT * FROM refunds WHERE id=?`,
      [id]
    );

    if (!refund) throw new Error("Refund not found");

    if (refund.refund_type !== "FULL") {
      throw new Error("Admin can only process FULL refunds");
    }

    //////////////////////////////////////////////////////
    // ✅ ONLY UPDATE REFUND (NO VACATE CHANGE)
    //////////////////////////////////////////////////////
    await db.query(
      `UPDATE refunds SET status='paid' WHERE id=?`,
      [id]
    );

    res.json({
      success: true,
      message: "FULL refund marked as paid"
    });

  } catch (err) {
    console.error("❌ ADMIN FULL REFUND ERROR:", err);
    res.status(500).json({ message: err.message });
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

    res.json({
      success: true,
      message: "FULL refund rejected"
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};