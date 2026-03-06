const db = require("../db");

//////////////////////////////////////////////////////
// GET PENDING OWNER SETTLEMENTS
//////////////////////////////////////////////////////

exports.getPendingSettlements = async (req, res) => {

  try {

    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.owner_amount,

        o.name AS owner_name,

        obd.account_holder_name,
        obd.account_number,
        obd.ifsc,
        obd.bank_name,
        obd.branch

      FROM bookings b

      LEFT JOIN owners o
        ON o.id = b.owner_id

      LEFT JOIN owner_bank_details obd
        ON obd.owner_id = o.id

      WHERE 
        b.status='confirmed'
        AND b.owner_settlement='PENDING'

      ORDER BY b.created_at DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {

    console.error("GET SETTLEMENT ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Failed to load settlements"
    });

  }

};


//////////////////////////////////////////////////////
// MARK OWNER PAYMENT AS SETTLED
//////////////////////////////////////////////////////

exports.markAsSettled = async (req, res) => {

  try {

    const bookingId = req.params.bookingId;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID required"
      });
    }

    await db.query(`
      UPDATE bookings
      SET 
        owner_settlement='DONE',
        settlement_date=NOW()
      WHERE id=?
    `, [bookingId]);

    res.json({
      success: true,
      message: "Settlement completed"
    });

  } catch (err) {

    console.error("SETTLEMENT ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Settlement failed"
    });

  }

};