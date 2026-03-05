const db = require("../db");

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

    const [existing] = await db.query(
      `SELECT status FROM payments WHERE order_id=?`,
      [orderId]
    );

    if (!existing.length) {
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
      success: false
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

    const [[payment]] = await db.query(
      `SELECT booking_id FROM payments WHERE order_id=?`,
      [orderId]
    );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
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
       SET status='confirmed',
           payment_status='paid'
       WHERE id=?`,
      [payment.booking_id]
    );

    console.log("✅ PAYMENT VERIFIED:", orderId);

    res.json({
      success: true
    });

  } catch (err) {

    console.error("🔥 VERIFY ERROR:", err);

    res.status(500).json({
      success: false
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
        success: false
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
      success: true
    });

  } catch (err) {

    console.error("🔥 REJECT ERROR:", err);

    res.status(500).json({
      success: false
    });

  }

};