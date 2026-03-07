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
        b.status,

        pg.pg_name,

        p.amount,
        p.status AS payment_status,
        p.order_id,
        p.created_at

      FROM bookings b

      LEFT JOIN payments p
        ON p.booking_id = b.id

      LEFT JOIN pgs pg
        ON pg.id = b.pg_id

      WHERE
        b.owner_id = ?
        AND p.status = 'paid'

      ORDER BY p.created_at DESC

    `, [ownerId]);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {

    console.error("OWNER PAYMENTS ERROR:", err);

    res.status(500).json({
      success:false,
      message:"Failed to load owner payments"
    });

  }

};