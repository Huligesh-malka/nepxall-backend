const Cashfree = require("../cashfree");
const db = require("../db");

//////////////////////////////////////////////////////
// CREATE ORDER
//////////////////////////////////////////////////////
exports.createOrder = async (req, res) => {
  try {
    const { bookingId, amount } = req.body;

    const orderId = `order_${bookingId}_${Date.now()}`;

    const response = await Cashfree.PGCreateOrder({
      order_id: orderId,
      order_amount: amount,
      order_currency: "INR",

      customer_details: {
        customer_id: String(req.user.id),
        customer_email:
          req.user.email || `user${req.user.id}@nepxall.com`,
        customer_phone: req.user.phone,
      },

      order_meta: {
        return_url: `${process.env.FRONTEND_URL}/payment-success?order_id={order_id}`,
      },
    });

    await db.query(
      `INSERT INTO payments (booking_id, order_id, amount, status)
       VALUES (?, ?, ?, 'pending')`,
      [bookingId, orderId, amount]
    );

    res.json({
      success: true,
      payment_session_id: response.data.payment_session_id,
      order_id: orderId,
    });

  } catch (err) {
    console.error("CREATE ORDER ERROR:", err.response?.data || err);
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || "Cashfree order failed",
    });
  }
};

//////////////////////////////////////////////////////
// VERIFY PAYMENT
//////////////////////////////////////////////////////
exports.verifyPayment = async (req, res) => {
  try {
    const { orderId } = req.params;

    const response = await Cashfree.PGFetchOrder(orderId);

    if (response.data.order_status === "PAID") {
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
    }

    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error("❌ VERIFY ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

//////////////////////////////////////////////////////
// ADMIN – GET PENDING SETTLEMENTS
//////////////////////////////////////////////////////
exports.getPendingSettlements = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
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
      WHERE b.status = 'confirmed'
      AND b.owner_settlement = 'PENDING'
      ORDER BY b.id DESC
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("❌ SETTLEMENT LIST ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

//////////////////////////////////////////////////////
// ADMIN – MARK AS SETTLED
//////////////////////////////////////////////////////
exports.markAsSettled = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { bookingId } = req.params;

    await db.query(
      `UPDATE bookings
       SET owner_settlement='DONE',
           settlement_date=NOW()
       WHERE id=?`,
      [bookingId]
    );

    res.json({ success: true, message: "Settlement completed" });
  } catch (err) {
    console.error("❌ SETTLEMENT UPDATE ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
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