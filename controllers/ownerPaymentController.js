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
        b.settlement_date,
        b.updated_at,
        'paid' AS payment_status,

        pg.pg_name

      FROM bookings b

      JOIN pgs pg
        ON pg.id = b.pg_id

      WHERE b.owner_id = ?
      AND b.status = 'confirmed'

      ORDER BY b.updated_at DESC
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