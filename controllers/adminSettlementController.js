const db = require("../db");

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
      WHERE b.owner_settlement = 'PENDING'
      AND b.owner_amount > 0
    `);

    return res.json({
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