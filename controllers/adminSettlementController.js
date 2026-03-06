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

        p.id AS pg_id,
        p.pg_name,
        p.city,
        p.area,

        obd.account_holder_name,
        obd.account_number,
        obd.ifsc,
        obd.bank_name,
        obd.branch

      FROM bookings b

      LEFT JOIN users u
        ON u.id = b.owner_id

      LEFT JOIN pgs p
        ON p.id = b.pg_id

      LEFT JOIN owner_bank_details obd
        ON obd.owner_id = b.owner_id

      WHERE b.owner_settlement = 'PENDING'
      AND b.owner_amount > 0

      ORDER BY b.id DESC
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

    await db.query(
      `UPDATE bookings 
       SET owner_settlement = 'DONE',
           settlement_date = NOW()
       WHERE id = ?`,
      [bookingId]
    );

    res.json({
      success: true,
      message: "Settlement completed"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Settlement failed"
    });
  }
};