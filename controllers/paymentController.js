const QRCode = require("qrcode");
const db = require("../db");

//////////////////////////////////////////////////////
// CREATE UPI PAYMENT
//////////////////////////////////////////////////////
exports.createPayment = async (req, res) => {
  try {
    const { bookingId, amount } = req.body;

    const orderId = `order_${bookingId}_${Date.now()}`;

    const upiId = process.env.UPI_ID || "nepxall@upi";
    const merchantName = "Nepxall";

    const upiLink = `upi://pay?pa=${upiId}&pn=${merchantName}&am=${amount}&cu=INR&tn=${orderId}`;

    const qr = await QRCode.toDataURL(upiLink);

    await db.query(
      `INSERT INTO payments (booking_id, order_id, amount, status)
       VALUES (?, ?, ?, 'pending')`,
      [bookingId, orderId, amount]
    );

    res.json({
      success: true,
      orderId,
      upiLink,
      qr,
    });

  } catch (err) {
    console.error("❌ CREATE PAYMENT ERROR:", err.message);

    res.status(500).json({
      success: false,
      message: "Payment creation failed",
    });
  }
};

//////////////////////////////////////////////////////
// SUBMIT UTR (USER)
//////////////////////////////////////////////////////
exports.submitUTR = async (req, res) => {
  try {
    const { orderId, utr } = req.body;

    await db.query(
      `UPDATE payments
       SET utr=?, status='submitted'
       WHERE order_id=?`,
      [utr, orderId]
    );

    res.json({
      success: true,
      message: "Payment submitted for verification",
    });

  } catch (err) {
    console.error("❌ UTR SUBMIT ERROR:", err.message);
    res.status(500).json({ success: false });
  }
};

//////////////////////////////////////////////////////
// ADMIN VERIFY PAYMENT
//////////////////////////////////////////////////////
exports.verifyPayment = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false });
    }

    const { orderId } = req.params;

    await db.query(
      `UPDATE payments SET status='paid' WHERE order_id=?`,
      [orderId]
    );

    const [[payment]] = await db.query(
      `SELECT booking_id FROM payments WHERE order_id=?`,
      [orderId]
    );

    if (!payment) {
      return res.json({ success: true });
    }

    const bookingId = payment.booking_id;

    await db.query(
      `
      UPDATE bookings
      SET 
        status = 'confirmed',
        owner_amount = (
          COALESCE(rent_amount,0) +
          COALESCE(security_deposit,0) +
          COALESCE(maintenance_amount,0)
        ),
        owner_settlement = 'PENDING'
      WHERE id = ?
      `,
      [bookingId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("❌ VERIFY ERROR:", err.message);
    res.status(500).json({ success: false });
  }
};

//////////////////////////////////////////////////////
// ADMIN – GET PENDING SETTLEMENTS
//////////////////////////////////////////////////////
exports.getPendingSettlements = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false });
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

    res.json({ success: true, data: rows });

  } catch (err) {
    console.error("❌ SETTLEMENT LIST ERROR:", err.message);
    res.status(500).json({ success: false });
  }
};

//////////////////////////////////////////////////////
// ADMIN – MARK AS SETTLED
//////////////////////////////////////////////////////
exports.markAsSettled = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false });
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
      success: true,
      message: "Settlement completed",
    });

  } catch (err) {
    console.error("❌ SETTLEMENT UPDATE ERROR:", err.message);
    res.status(500).json({ success: false });
  }
};

//////////////////////////////////////////////////////
// ADMIN – FINANCE SUMMARY
//////////////////////////////////////////////////////
exports.getFinanceSummary = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false });
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

    res.json({ success: true, data: summary });

  } catch (err) {
    console.error("❌ FINANCE SUMMARY ERROR:", err.message);
    res.status(500).json({ success: false });
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

    res.json({ success: true, data: rows });

  } catch (err) {
    console.error("❌ SETTLEMENT HISTORY ERROR:", err.message);
    res.status(500).json({ success: false });
  }
};