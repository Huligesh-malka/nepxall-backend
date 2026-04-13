const db = require("../db");
const QRCode = require("qrcode");

/* =========================================================
   ⚙️ CONFIG
========================================================= */
const isTestMode = true; // 🔥 change to false in production

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

    // ✅ Validate plan
    if (!planPrices[plan]) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan selected"
      });
    }

    const amount = planPrices[plan];

    /* =========================================================
       🔁 CHECK EXISTING PENDING PAYMENT (REUSE QR)
    ========================================================= */
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
        message: "Existing payment reused",
        orderId: old.order_id,
        qr,
        amount: old.amount
      });
    }

    /* =========================================================
       🆕 CREATE NEW PAYMENT
    ========================================================= */
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


/* =========================================================
   👨‍💼 VERIFY PLAN PAYMENT (ADMIN)
========================================================= */
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

    // ✅ Mark as paid
    await db.query(
      "UPDATE plan_payments SET status='paid', verified_by_admin=1 WHERE order_id=?",
      [orderId]
    );

    // ✅ Plan expiry
    const expiry = new Date(
      Date.now() + PLAN_DURATION_DAYS * 24 * 60 * 60 * 1000
    );

    // ✅ Activate plan
    await db.query(
      "UPDATE users SET plan=?, plan_expiry=? WHERE id=?",
      [data.plan, expiry, data.owner_id]
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