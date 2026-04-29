const db = require("../db");
const { Cashfree, CFEnvironment } = require("cashfree-pg");

/* =========================================================
   ⚙️ CONFIG (PRODUCTION)
========================================================= */

const cashfree = new Cashfree(
  CFEnvironment.PRODUCTION,
  process.env.CASHFREE_APP_ID,
  process.env.CASHFREE_SECRET_KEY
);

const planPrices = {
  basic: 1,
  pro: 1
};

const PLAN_DURATION_DAYS = 30;

/* =========================================================
   💰 CREATE CASHFREE PLAN ORDER
========================================================= */

exports.createCashfreePlanOrder = async (req, res) => {
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

    const amount = planPrices[plan];
    const order_id = `plan_${ownerId}_${Date.now()}`;

    // Insert payment record
    await db.query(
      `INSERT INTO plan_payments 
       (owner_id, plan, amount, order_id, status, created_at) 
       VALUES (?, ?, ?, ?, 'pending', NOW())`,
      [ownerId, plan, amount, order_id]
    );

    // Create Cashfree order
    const request = {
      order_id: order_id,
      order_amount: amount,
      order_currency: "INR",
      customer_details: {
        customer_id: String(ownerId),
        customer_phone: "9999999999",
        customer_email: "support@nepxall.com"
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL}/owner/premium-plans?order_id={order_id}`
      }
    };

    const response = await cashfree.PGCreateOrder(request);

    res.json({
      success: true,
      payment_session_id: response.data.payment_session_id,
      order_id: order_id
    });

  } catch (err) {
    console.error("Create Cashfree Order Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create payment order"
    });
  }
};

/* =========================================================
   🔄 AUTO VERIFY CASHFREE PAYMENT
========================================================= */

exports.verifyCashfreePlanPayment = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Fetch payment status from Cashfree
    const response = await cashfree.PGOrderFetchPayments(orderId);
    const payments = response.data || [];
    
    const isPaid = payments.some(
      p => p.payment_status === "SUCCESS" || p.payment_status === "PAID"
    );

    if (!isPaid) {
      return res.json({
        success: true,
        isPaid: false
      });
    }

    // Get payment record from database
    const [[payment]] = await db.query(
      `SELECT * FROM plan_payments WHERE order_id = ?`,
      [orderId]
    );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    // Already verified
    if (payment.status === "paid") {
      return res.json({
        success: true,
        isPaid: true
      });
    }

    // Check if user already has active plan
    const [[user]] = await db.query(
      "SELECT plan_expiry FROM users WHERE id = ?",
      [payment.owner_id]
    );

    if (user?.plan_expiry && new Date(user.plan_expiry) > new Date()) {
      // Update payment as paid but don't override existing plan
      await db.query(
        `UPDATE plan_payments SET status = 'paid' WHERE order_id = ?`,
        [orderId]
      );
      
      return res.json({
        success: true,
        isPaid: true,
        message: "Payment verified but user already has active plan"
      });
    }

    // Update payment status
    await db.query(
      `UPDATE plan_payments SET status = 'paid' WHERE order_id = ?`,
      [orderId]
    );

    // Calculate expiry date
    const expiry = new Date(Date.now() + PLAN_DURATION_DAYS * 24 * 60 * 60 * 1000);

    // Update user's plan
    await db.query(
      `UPDATE users SET plan = ?, plan_expiry = ? WHERE id = ?`,
      [payment.plan, expiry, payment.owner_id]
    );

    res.json({
      success: true,
      isPaid: true,
      message: `Plan '${payment.plan}' activated successfully!`,
      expiry: expiry
    });

  } catch (err) {
    console.error("Verify Cashfree Payment Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to verify payment"
    });
  }
};

/* =========================================================
   📋 GET PLAN PAYMENTS (ADMIN)
========================================================= */

exports.getPlanPayments = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        p.*, 
        u.name, 
        u.phone, 
        u.plan as user_current_plan, 
        u.plan_expiry
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