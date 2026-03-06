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

    res.json({
      success: true,
      orderId,
      upiLink,
      qr
    });

  } catch (err) {

    console.error("CREATE PAYMENT ERROR:", err);

    res.status(500).json({
      success: false
    });

  }
};

//////////////////////////////////////////////////////
// USER CONFIRM PAYMENT
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

    await db.query(
      `UPDATE payments SET status='submitted' WHERE order_id=?`,
      [orderId]
    );

    res.json({
      success: true,
      message: "Payment submitted"
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false
    });

  }

};

//////////////////////////////////////////////////////
// ADMIN GET ALL PAYMENTS
//////////////////////////////////////////////////////
exports.getAdminPayments = async (req, res) => {

  try {

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success:false,
        message:"Admin only"
      });
    }

    const [rows] = await db.query(`
      SELECT 
        p.order_id,
        p.amount,
        p.status,
        p.created_at,
        u.name AS tenant_name,
        u.phone,
        pg.name AS pg_name
      FROM payments p
      LEFT JOIN bookings b ON b.id = p.booking_id
      LEFT JOIN users u ON u.id = b.user_id
      LEFT JOIN pgs pg ON pg.id = b.pg_id
      ORDER BY p.created_at DESC
    `);

    res.json({
      success:true,
      data:rows
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
      return res.status(403).json({ success:false });
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
      `UPDATE payments SET status='paid' WHERE order_id=?`,
      [orderId]
    );

    await db.query(
      `UPDATE bookings
       SET status='confirmed'
       WHERE id=?`,
      [payment.booking_id]
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

//////////////////////////////////////////////////////
// ADMIN REJECT PAYMENT
//////////////////////////////////////////////////////
exports.rejectPayment = async (req, res) => {

  try {

    if (req.user.role !== "admin") {
      return res.status(403).json({ success:false });
    }

    const { orderId } = req.params;

    await db.query(
      `UPDATE payments SET status='rejected' WHERE order_id=?`,
      [orderId]
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