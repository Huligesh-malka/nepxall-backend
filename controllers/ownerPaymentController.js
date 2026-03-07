const db = require("../db");

exports.getOwnerPayments = async (req, res) => {
  try {
    const ownerId = req.user.id;

    // We join pgs to get the name and payments to get the real transaction status
    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.name AS tenant_name,
        b.phone,
        b.owner_amount,
        b.owner_settlement,
        b.settlement_date,
        b.status AS booking_status,
        pg.pg_name,
        p.status AS payment_status,
        p.utr
      FROM bookings b
      JOIN pgs pg ON pg.id = b.pg_id
      LEFT JOIN payments p ON b.id = p.booking_id
      WHERE b.owner_id = ? 
      AND b.status IN ('confirmed', 'approved', 'agreement_ready')
      ORDER BY b.created_at DESC
    `, [ownerId]);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error("OWNER PAYMENTS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load owner payments"
    });
  }
};