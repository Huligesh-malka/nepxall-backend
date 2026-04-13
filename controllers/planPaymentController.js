const db = require("../db");
const QRCode = require("qrcode");

/* =========================================================
   ⚙️ CONFIG
========================================================= */
const isTestMode = true;

const planPrices = isTestMode
  ? { basic: 1, pro: 1 }
  : { basic: 199, pro: 599 };

const PLAN_DURATION_DAYS = 30;
const UPI_ID = "huligeshmalka-1@oksbi";

/* =========================================================
   💰 CREATE PLAN PAYMENT (QR)
========================================================= */
exports.createPlanPayment = async (req, res) => {
  try {
    const { plan } = req.body;
    const ownerId = req.user.id;

    if (!planPrices[plan]) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan"
      });
    }

    const amount = planPrices[plan];

    // 🔁 REUSE EXISTING
    const [existing] = await db.query(
      "SELECT * FROM plan_payments WHERE owner_id=? AND status='pending'",
      [ownerId]
    );

    if (existing.length > 0) {
      const old = existing[0];

      const upiLink = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent("Nepxall")}&tr=${old.order_id}&tn=${old.order_id}&am=${old.amount}&cu=INR`;

      const qr = await QRCode.toDataURL(upiLink);

      return res.json({
        success: true,
        orderId: old.order_id,
        qr,
        amount: old.amount
      });
    }

    // 🆕 CREATE NEW
    const orderId = `plan_${ownerId}_${Date.now()}`;

    const upiLink = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent("Nepxall")}&tr=${orderId}&tn=${orderId}&am=${amount}&cu=INR`;

    const qr = await QRCode.toDataURL(upiLink);

    await db.query(
      `INSERT INTO plan_payments (owner_id, plan, amount, order_id, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [ownerId, plan, amount, orderId]
    );

    res.json({
      success: true,
      orderId,
      qr,
      amount
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};


/* =========================================================
   🚀 AUTO VERIFY (NO ADMIN)
========================================================= */
exports.autoVerifyPlanPayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId required"
      });
    }

    const [[data]] = await db.query(
      "SELECT * FROM plan_payments WHERE order_id=?",
      [orderId]
    );

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    if (data.status === "paid") {
      return res.json({
        success: true,
        message: "Already verified"
      });
    }

    // 🔥 SIMPLE AUTO VERIFY (USER CONFIRM BASED)
    await db.query(
      "UPDATE plan_payments SET status='paid' WHERE order_id=?",
      [orderId]
    );

    const expiry = new Date(
      Date.now() + PLAN_DURATION_DAYS * 24 * 60 * 60 * 1000
    );

    await db.query(
      "UPDATE users SET plan=?, plan_expiry=? WHERE id=?",
      [data.plan, expiry, data.owner_id]
    );

    res.json({
      success: true,
      message: "Plan activated 🚀",
      expiry
    });

  } catch (err) {
    console.error("AUTO VERIFY ERROR:", err);
    res.status(500).json({ success: false });
  }
};


/* =========================================================
   📊 GET PLAN PAYMENTS
========================================================= */
exports.getPlanPayments = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.*, u.name, u.phone
      FROM plan_payments p
      LEFT JOIN users u ON u.id = p.owner_id
      ORDER BY p.created_at DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    res.status(500).json({ success: false });
  }
};