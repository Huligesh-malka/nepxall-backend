const db = require("../db");

exports.getOwnerPayments = async (req, res) => {
  try {

    const ownerId = req.user.id;

    const [rows] = await db.query(`
      SELECT
        b.id AS booking_id,
        b.name AS tenant_name,
        b.phone AS tenant_phone,
        b.owner_amount,
        b.owner_settlement,

        p.status AS payment_status,
        p.amount AS paid_amount,

        pg.pg_name,
        b.created_at

      FROM bookings b

      LEFT JOIN payments p
      ON p.booking_id = b.id

      LEFT JOIN pgs pg
      ON pg.id = b.pg_id

      WHERE b.owner_id = ?

      ORDER BY b.created_at DESC
    `, [ownerId]);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false,
      message: "Failed to load owner payments"
    });

  }
};