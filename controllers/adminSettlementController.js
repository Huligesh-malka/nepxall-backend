const db = require("../db");

//////////////////////////////////////////////////////
// GET PENDING OWNER SETTLEMENTS
//////////////////////////////////////////////////////
exports.getPendingSettlements = async (req, res) => {
  try {

    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.owner_id,
        b.owner_amount,

        u.name AS owner_name,
        u.phone AS owner_phone,

        pg.id AS pg_id,
        pg.pg_name,
        pg.city,
        pg.area,

        obd.account_holder_name,
        obd.account_number,
        obd.ifsc,
        obd.bank_name,
        obd.branch,

        /* ✅ PAYMENT DETAILS */
        pay.id AS payment_id,
        pay.order_id,
        pay.amount AS payment_amount,
        pay.created_at AS payment_date,
        pay.status AS payment_status,
        pay.utr

      FROM bookings b

      /* 🔥 JOIN ALL PAID PAYMENTS */
      INNER JOIN payments pay 
        ON pay.booking_id = b.id
        AND pay.status = 'paid'

      LEFT JOIN users u
        ON u.id = b.owner_id

      LEFT JOIN pgs pg
        ON pg.id = b.pg_id

      LEFT JOIN owner_bank_details obd
        ON obd.owner_id = b.owner_id

      WHERE b.owner_settlement = 'PENDING'
      AND b.owner_amount > 0

      ORDER BY pay.created_at DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {

    console.error("Settlement error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load settlements"
    });
  }
};
//////////////////////////////////////////////////////
// MARK OWNER SETTLED
//////////////////////////////////////////////////////
exports.markAsSettled = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;

    // 🔥 GET FULL DATA
    const [rows] = await db.query(`
      SELECT 
        b.id,
        b.owner_id,
        b.owner_amount,
        b.owner_settlement,
        u.name,
        u.phone,
        pg.pg_name,
        pay.order_id
      FROM bookings b
      JOIN users u ON u.id = b.owner_id
      JOIN pgs pg ON pg.id = b.pg_id
      LEFT JOIN payments pay ON pay.booking_id = b.id
      WHERE b.id = ?
    `, [bookingId]);

    const data = rows[0];

    // 🔥 UPDATE BOOKINGS
    await db.query(`
      UPDATE bookings 
      SET admin_settlement = 'DONE',
          owner_settlement = 'PENDING'
      WHERE id = ?
    `, [bookingId]);

    // 🔥 INSERT INTO HISTORY (PERMANENT)
    await db.query(`
      INSERT INTO settlement_history (
        booking_id,
        owner_id,
        owner_name,
        owner_phone,
        pg_name,
        amount,
        order_id,
        admin_settlement,
        owner_settlement,
        settled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      data.id,
      data.owner_id,
      data.name,
      data.phone,
      data.pg_name,
      data.owner_amount,
      data.order_id,
      "DONE",
      "PENDING"
    ]);

    res.json({
      success: true,
      message: "Admin settlement stored permanently ✅"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

exports.getSettlementHistory = async (req, res) => {
  try {

    const [rows] = await db.query(`
      SELECT *
      FROM settlement_history
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to load history"
    });
  }
};