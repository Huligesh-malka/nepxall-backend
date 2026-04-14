const db = require("../db");
const QRCode = require("qrcode");

/* =========================================================
   ⚙️ CONFIG (PRODUCTION)
========================================================= */

const planPrices = {
  basic: 199,
  pro: 599
};

const PLAN_DURATION_DAYS = 30;
const UPI_ID = "huligeshmalka-1@oksbi";

/* =========================================================
   💰 CREATE PLAN PAYMENT (QR)
========================================================= */

exports.createPlanPayment = async (req, res) => {
  try {
    const { plan } = req.body;
    const ownerId = req.user.id;

    // ✅ Validate plan
    if (!planPrices[plan]) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan selected"
      });
    }

    // ✅ 🚫 BLOCK if already active plan
    const [[user]] = await db.query(
      "SELECT plan_expiry FROM users WHERE id=?",
      [ownerId]
    );

    if (user?.plan_expiry && new Date(user.plan_expiry) > new Date()) {
      return res.status(400).json({
        success: false,
        message: "You already have an active plan"
      });
    }

    // ✅ 🔁 REUSE pending payment (IMPORTANT FIX)
   const [existing] = await db.query(
  "SELECT * FROM plan_payments WHERE owner_id=? AND plan=? AND status='pending'",
  [ownerId, plan]
);

    if (existing.length > 0) {
      const old = existing[0];

      const upiLink = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(
        "Nepxall"
      )}&tr=${old.order_id}&tn=${old.order_id}&am=${old.amount}&cu=INR`;

      const qr = await QRCode.toDataURL(upiLink);

      return res.json({
        success: true,
        message: "Pending payment reused",
        orderId: old.order_id,
        qr,
        amount: old.amount
      });
    }

    const amount = planPrices[plan];

    /* =========================================================
       🆕 CREATE NEW PAYMENT
    ========================================================= */

    const orderId = `plan_${ownerId}_${Date.now()}`;

    const upiLink = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(
      "Nepxall"
    )}&tr=${orderId}&tn=${orderId}&am=${amount}&cu=INR`;

    const qr = await QRCode.toDataURL(upiLink);

    await db.query(
      `INSERT INTO plan_payments (owner_id, plan, amount, order_id, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [ownerId, plan, amount, orderId]
    );

    res.json({
      success: true,
      message: "QR generated",
      orderId,
      qr,
      amount
    });

  } catch (err) {
    console.error("Create Plan Payment Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};
exports.verifyPlanPayment = async (req, res) => {
  try {
    const { orderId } = req.params;

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
      return res.status(400).json({
        success: false,
        message: "Already verified"
      });
    }

    // ✅ MARK THIS PAYMENT AS PAID
    await db.query(
      "UPDATE plan_payments SET status='paid', verified_by_admin=1 WHERE order_id=?",
      [orderId]
    );

    // ✅ EXPIRE OLD USER PLAN (NOT payments table)
    const expiry = new Date(
      Date.now() + PLAN_DURATION_DAYS * 24 * 60 * 60 * 1000
    );

    // ✅ UPDATE USER PLAN (MAIN SOURCE)
    await db.query(
      "UPDATE users SET plan=?, plan_expiry=? WHERE id=?",
      [data.plan, expiry, data.owner_id]
    );

    // ✅ OPTIONAL: mark other payments as expired AFTER activation
    await db.query(
      "UPDATE plan_payments SET status='expired' WHERE owner_id=? AND order_id!=? AND status='paid'",
      [data.owner_id, orderId]
    );

    res.json({
      success: true,
      message: `Plan '${data.plan}' activated successfully 🚀`,
      expiry
    });

  } catch (err) {
    console.error("Verify Plan Payment Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};
/* =========================================================
   📊 GET ALL PLAN PAYMENTS (ADMIN)
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
    console.error("Get Plan Payments Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};