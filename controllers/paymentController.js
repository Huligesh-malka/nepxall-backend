const QRCode = require("qrcode");
const db = require("../db");

const UPI_ID = "huligeshmalka-1@oksbi";
const MERCHANT_NAME = "Nepxall";

//////////////////////////////////////////////////////
// CREATE UPI PAYMENT
//////////////////////////////////////////////////////
exports.createPayment = async (req, res) => {
  try {
    const { bookingId, amount } = req.body;

    if (!bookingId || !amount) {
      return res.status(400).json({
        success: false,
        message: "bookingId and amount required"
      });
    }

    const orderId = `order_${bookingId}_${Date.now()}`;

    const upiLink =
      `upi://pay?pa=${UPI_ID}` +
      `&pn=${encodeURIComponent(MERCHANT_NAME)}` +
      `&tr=${orderId}` +
      `&tn=${orderId}` +
      `&am=${amount}` +
      `&cu=INR`;

    const qr = await QRCode.toDataURL(upiLink);

    await db.query(
      `INSERT INTO payments
       (booking_id, order_id, amount, status, created_at)
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
      success: false,
      message: "Payment creation failed"
    });
  }
};

//////////////////////////////////////////////////////
// USER SUBMIT UTR
//////////////////////////////////////////////////////
exports.submitUTR = async (req, res) => {
  try {
    const { orderId, utr } = req.body;

    if (!orderId || !utr) {
      return res.status(400).json({
        success: false,
        message: "orderId and UTR required"
      });
    }

    const [rows] = await db.query(
      `SELECT status FROM payments WHERE order_id=?`,
      [orderId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    await db.query(
      `UPDATE payments
       SET utr=?, status='submitted', updated_at=NOW()
       WHERE order_id=?`,
      [utr, orderId]
    );

    console.log("🧾 UTR Submitted:", orderId);

    res.json({
      success: true,
      message: "Payment submitted for verification"
    });

  } catch (err) {
    console.error("❌ UTR SUBMIT ERROR:", err);
    res.status(500).json({
      success: false,
      message: "UTR submission failed"
    });
  }
};

//////////////////////////////////////////////////////
// ADMIN GET SUBMITTED PAYMENTS
//////////////////////////////////////////////////////
exports.getSubmittedPayments = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ 
        success: false,
        message: "Access denied" 
      });
    }

    const [rows] = await db.query(`
      SELECT
        p.order_id,
        p.amount,
        p.utr,
        p.status,
        p.created_at,
        u.name AS tenant_name,
        u.phone,
        pg.pg_name,
        b.id AS booking_id
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      JOIN users u ON u.id = b.user_id
      JOIN pgs pg ON pg.id = b.pg_id
      WHERE p.status='submitted'
      ORDER BY p.created_at DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error("ADMIN PAYMENTS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payments"
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
        success: false,
        message: "Access denied"
      });
    }

    const { orderId } = req.params;

    const [paymentRows] = await db.query(
      `SELECT booking_id FROM payments WHERE order_id=?`,
      [orderId]
    );

    if (!paymentRows.length) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    const payment = paymentRows[0];

    await db.query(
      `UPDATE payments
       SET status='paid', updated_at=NOW()
       WHERE order_id=?`,
      [orderId]
    );

    await db.query(
      `UPDATE bookings
       SET status='confirmed',
           payment_status='paid'
       WHERE id=?`,
      [payment.booking_id]
    );

    console.log("✅ PAYMENT VERIFIED:", orderId);

    res.json({
      success: true,
      message: "Payment verified successfully"
    });

  } catch (err) {
    console.error("🔥 VERIFY ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Verification failed"
    });
  }
};

//////////////////////////////////////////////////////
// ADMIN REJECT PAYMENT
//////////////////////////////////////////////////////
exports.rejectPayment = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ 
        success: false,
        message: "Access denied" 
      });
    }

    const { orderId } = req.params;

    await db.query(
      `UPDATE payments
       SET status='rejected', updated_at=NOW()
       WHERE order_id=?`,
      [orderId]
    );

    console.log("❌ PAYMENT REJECTED:", orderId);

    res.json({
      success: true,
      message: "Payment rejected successfully"
    });

  } catch (err) {
    console.error("🔥 REJECT ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Rejection failed"
    });
  }
};

//////////////////////////////////////////////////////
// GET PENDING SETTLEMENTS (FOR ADMIN)
//////////////////////////////////////////////////////
exports.getPendingSettlements = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ 
        success: false,
        message: "Access denied" 
      });
    }

    // Add your pending settlements logic here
    res.json({
      success: true,
      data: []
    });

  } catch (err) {
    console.error("PENDING SETTLEMENTS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending settlements"
    });
  }
};

//////////////////////////////////////////////////////
// MARK AS SETTLED (FOR ADMIN)
//////////////////////////////////////////////////////
exports.markAsSettled = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ 
        success: false,
        message: "Access denied" 
      });
    }

    const { bookingId } = req.params;

    // Add your mark as settled logic here
    res.json({
      success: true,
      message: `Booking ${bookingId} marked as settled`
    });

  } catch (err) {
    console.error("MARK SETTLED ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to mark as settled"
    });
  }
};

//////////////////////////////////////////////////////
// GET FINANCE SUMMARY (FOR ADMIN)
//////////////////////////////////////////////////////
exports.getFinanceSummary = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ 
        success: false,
        message: "Access denied" 
      });
    }

    // Add your finance summary logic here
    res.json({
      success: true,
      data: {
        totalRevenue: 0,
        pendingSettlements: 0,
        completedSettlements: 0
      }
    });

  } catch (err) {
    console.error("FINANCE SUMMARY ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch finance summary"
    });
  }
};

//////////////////////////////////////////////////////
// GET SETTLEMENT HISTORY (FOR ADMIN)
//////////////////////////////////////////////////////
exports.getSettlementHistory = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ 
        success: false,
        message: "Access denied" 
      });
    }

    // Add your settlement history logic here
    res.json({
      success: true,
      data: []
    });

  } catch (err) {
    console.error("SETTLEMENT HISTORY ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch settlement history"
    });
  }
};

//////////////////////////////////////////////////////
// PAYMENT WEBHOOK (OPTIONAL GATEWAY)
//////////////////////////////////////////////////////
exports.paymentWebhook = async (req, res) => {
  try {
    const { orderId, status } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId required"
      });
    }

    if (status !== "SUCCESS") {
      return res.json({
        success: false,
        message: "Payment not successful"
      });
    }

    const [paymentRows] = await db.query(
      `SELECT booking_id FROM payments WHERE order_id=?`,
      [orderId]
    );

    if (!paymentRows.length) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    const payment = paymentRows[0];

    await db.query(
      `UPDATE payments
       SET status='paid', updated_at=NOW()
       WHERE order_id=?`,
      [orderId]
    );

    await db.query(
      `UPDATE bookings
       SET status='confirmed',
           payment_status='paid'
       WHERE id=?`,
      [payment.booking_id]
    );

    console.log("🔥 AUTO PAYMENT VERIFIED:", orderId);

    res.json({
      success: true,
      message: "Payment verified via webhook"
    });

  } catch (err) {
    console.error("🔥 WEBHOOK ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Webhook processing failed"
    });
  }
};