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
        p.created_at,

        b.name AS tenant_name,
        b.phone,
        b.owner_amount,
        b.owner_settlement,
        b.settlement_date,

        pg.pg_name

      FROM payments p

      JOIN bookings b
        ON b.id = p.booking_id

      JOIN pgs pg
        ON pg.id = b.pg_id

      WHERE b.owner_id = ?
      AND p.status = 'paid'

      ORDER BY p.created_at DESC
    `,[ownerId]);

    res.json({
      success:true,
      data:rows
    });

  } catch (err) {

    console.error("OWNER PAYMENTS ERROR:", err);

    res.status(500).json({
      success:false
    });

  }
};