const db = require("../db");

exports.getOwnerPayments = async (req, res) => {
  try {

    const ownerId = req.user.id;

    const [rows] = await db.query(`
      SELECT
        p.id AS payment_id,
        p.booking_id,
        p.amount,
        p.status AS payment_status,
        p.owner_settlement,
        p.settlement_date,
        p.created_at,

        b.name AS tenant_name,
        b.phone,

        pg.pg_name

      FROM payments p

      LEFT JOIN bookings b
        ON b.id = p.booking_id

      LEFT JOIN pgs pg
        ON pg.id = b.pg_id

      WHERE p.owner_id = ?
      AND p.status = 'paid'

      ORDER BY p.created_at DESC
    `,[ownerId]);

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