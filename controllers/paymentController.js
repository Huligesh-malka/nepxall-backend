const QRCode = require("qrcode");
const db = require("../db");

//////////////////////////////////////////////////////
// CREATE UPI PAYMENT
//////////////////////////////////////////////////////
exports.createPayment = async (req, res) => {
  try {

    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "bookingId required"
      });
    }

    const amount = 1; // testing

    const orderId = `order_${bookingId}_${Date.now()}`;

    const upiId = "huligeshmalka-1@oksbi";
    const merchantName = "Nepxall";
const upiLink =
  `upi://pay?pa=${upiId}` +
  `&pn=${encodeURIComponent(merchantName)}` +
  `&tr=${orderId}` +
  `&tn=${orderId}` +
  `&am=${amount}` +
  `&cu=INR`;

    const qr = await QRCode.toDataURL(upiLink);

    await db.query(
      `INSERT INTO payments (booking_id, order_id, amount, status, created_at)
       VALUES (?, ?, ?, 'pending', NOW())`,
      [bookingId, orderId, amount]
    );

    console.log("💰 Payment created:", orderId);

    res.json({
      success: true,
      orderId,
      upiLink,
      qr
    });

  } catch (err) {

    console.error("❌ CREATE PAYMENT ERROR:", err);

    res.status(500).json({
      success: false
    });

  }
};


// USER CLICKED "I HAVE PAID"
//////////////////////////////////////////////////////
exports.confirmPayment = async (req, res) => {
  try {

    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId required"
      });
    }

    // check if payment exists
    const [rows] = await db.query(
      "SELECT * FROM payments WHERE order_id=?",
      [orderId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    // update payment status
    await db.query(
      `UPDATE payments
       SET status='submitted'
       WHERE order_id=?`,
      [orderId]
    );

    console.log("📩 Payment submitted:", orderId);

    res.json({
      success: true,
      message: "Payment submitted for verification"
    });

  } catch (err) {

    console.error("❌ CONFIRM PAYMENT ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  }
};
//////////////////////////////////////////////////////
// OPTIONAL: AUTO MATCH BANK REMARK
//////////////////////////////////////////////////////
exports.matchBankTransaction = async (req, res) => {

  try {

    const { remark } = req.body;

    if (!remark) {
      return res.status(400).json({
        success:false,
        message:"remark required"
      });
    }

    const match = remark.match(/order_[0-9]+_[0-9]+/);

    if (!match) {
      return res.json({
        success:false,
        message:"order id not found"
      });
    }

    const orderId = match[0];

    const [[payment]] = await db.query(
      `SELECT booking_id FROM payments WHERE order_id=?`,
      [orderId]
    );

    if (!payment) {
      return res.json({
        success:false,
        message:"payment not found"
      });
    }

    await db.query(
      `UPDATE payments
       SET status='paid', updated_at=NOW()
       WHERE order_id=?`,
      [orderId]
    );

    await db.query(
      `UPDATE bookings
       SET status='confirmed'
       WHERE id=?`,
      [payment.booking_id]
    );

    res.json({
      success:true,
      message:"payment matched and confirmed"
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success:false
    });

  }

};

//////////////////////////////////////////////////////
// ADMIN VERIFY PAYMENT
//////////////////////////////////////////////////////
exports.verifyPayment = async (req, res) => {

  try {

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success:false,
        message:"Access denied"
      });
    }

    const { orderId } = req.params;

    const [[payment]] = await db.query(
      `SELECT booking_id FROM payments WHERE order_id=?`,
      [orderId]
    );

    if (!payment) {
      return res.status(404).json({
        success:false,
        message:"Payment not found"
      });
    }

    await db.query(
      `UPDATE payments
       SET status='paid', updated_at=NOW()
       WHERE order_id=?`,
      [orderId]
    );

    const bookingId = payment.booking_id;

    await db.query(
      `UPDATE bookings
       SET status='confirmed',
           owner_amount = (
             COALESCE(rent_amount,0) +
             COALESCE(security_deposit,0) +
             COALESCE(maintenance_amount,0)
           ),
           owner_settlement='PENDING'
       WHERE id=?`,
      [bookingId]
    );

    console.log("✅ PAYMENT VERIFIED:", orderId);

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

//////////////////////////////////////////////////////
// ADMIN – GET PENDING SETTLEMENTS
//////////////////////////////////////////////////////
exports.getPendingSettlements = async (req, res) => {

  try {

    if (req.user.role !== "admin") {
      return res.status(403).json({ success:false });
    }

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
      WHERE b.status='confirmed'
      AND b.owner_settlement='PENDING'
      ORDER BY b.id DESC
    `);

    res.json({
      success:true,
      data:rows
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({ success:false });

  }

};

//////////////////////////////////////////////////////
// ADMIN – MARK AS SETTLED
//////////////////////////////////////////////////////
exports.markAsSettled = async (req, res) => {

  try {

    if (req.user.role !== "admin") {
      return res.status(403).json({ success:false });
    }

    const { bookingId } = req.params;

    await db.query(
      `UPDATE bookings
       SET owner_settlement='DONE',
           settlement_date=NOW()
       WHERE id=?`,
      [bookingId]
    );

    res.json({
      success:true,
      message:"Settlement completed"
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({ success:false });

  }

};

//////////////////////////////////////////////////////
// ADMIN – FINANCE SUMMARY
//////////////////////////////////////////////////////
exports.getFinanceSummary = async (req, res) => {

  try {

    if (req.user.role !== "admin") {
      return res.status(403).json({ success:false });
    }

    const [[summary]] = await db.query(`
      SELECT
        (SELECT COALESCE(SUM(amount),0)
         FROM payments
         WHERE status='paid') AS total_received,

        (SELECT COALESCE(SUM(owner_amount),0)
         FROM bookings
         WHERE owner_settlement='PENDING'
         AND status='confirmed') AS pending_settlements,

        (SELECT COALESCE(SUM(owner_amount),0)
         FROM bookings
         WHERE owner_settlement='DONE'
         AND status='confirmed') AS total_settled,

        (SELECT COALESCE(SUM(amount),0)
         FROM payments
         WHERE status='paid'
         AND DATE(created_at)=CURDATE()) AS today_collection
    `);

    res.json({
      success:true,
      data:summary
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({ success:false });

  }

};

//////////////////////////////////////////////////////
// ADMIN – SETTLEMENT HISTORY
//////////////////////////////////////////////////////
exports.getSettlementHistory = async (req, res) => {

  try {

    const [rows] = await db.query(`
      SELECT
        b.id AS booking_id,
        b.owner_amount,
        b.settlement_date,
        u.name AS owner_name
      FROM bookings b
      JOIN users u ON u.id = b.owner_id
      WHERE b.owner_settlement='DONE'
      ORDER BY b.settlement_date DESC
    `);

    res.json({
      success:true,
      data:rows
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({ success:false });

  }

}; 