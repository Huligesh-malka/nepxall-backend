const db = require("../db");


exports.getPendingSettlements = async (req, res) => {
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
    JOIN owner_bank_details obd ON obd.owner_id = u.id
    WHERE b.payment_status='PAID'
    AND b.owner_settlement='PENDING'
  `);

  res.json(rows);
};




exports.markAsSettled = async (req, res) => {
  await db.query(
    `UPDATE bookings 
     SET owner_settlement='DONE',
         settlement_date=NOW()
     WHERE id=?`,
    [req.params.id]
  );

  res.json({ success: true });
};