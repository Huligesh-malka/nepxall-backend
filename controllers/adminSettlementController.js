const db = require("../db");

//////////////////////////////////////////////////////
// GET PENDING SETTLEMENTS
//////////////////////////////////////////////////////

exports.getPendingSettlements = async (req, res) => {

  try {

    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.owner_amount,
        u.name AS owner_name,
        obd.account_holder_name,
        obd.account_number,
        obd.ifsc,
        obd.bank_name,
        obd.branch
      FROM bookings b
      JOIN users u ON u.id = b.owner_id
      LEFT JOIN owner_bank_details obd ON obd.owner_id = u.id
      WHERE b.owner_amount > 0
      AND b.owner_settlement = 'PENDING'
      ORDER BY b.id DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success:false
    });

  }

};

//////////////////////////////////////////////////////
// MARK SETTLED
//////////////////////////////////////////////////////

exports.markAsSettled = async (req, res) => {

  try {

    const bookingId = req.params.bookingId;

    await db.query(
      `UPDATE bookings
       SET owner_settlement='DONE',
           settlement_date=NOW()
       WHERE id=?`,
      [bookingId]
    );

    res.json({
      success:true
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success:false
    });

  }

};