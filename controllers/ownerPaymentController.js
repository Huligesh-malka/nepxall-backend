const db = require("../db");


exports.getOwnerPayments = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.name AS tenant_name,
        b.phone,
        b.owner_amount,
        b.owner_settlement,
        b.status AS booking_status,
        pg.pg_name
      FROM bookings b
      LEFT JOIN pgs pg ON pg.id = b.pg_id 
      WHERE b.owner_id = ? 
      -- Broaden the status to ensure you see the data first
      AND b.status IN ('confirmed', 'CONFIRMED', 'approved')
      ORDER BY b.created_at DESC
    `, [ownerId]);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("PAYMENT ERROR:", err);
    res.status(500).json({ success: false, message: "Database error" });
  }
};