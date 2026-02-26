const crypto = require("crypto");
const db = require("../db");

exports.cashfreeWebhook = async (req, res) => {
  try {
    const rawBody = req.body.toString();
    const signature = req.headers["x-webhook-signature"];

    console.log("💥 WEBHOOK RECEIVED");

    /* =====================================================
       🔐 SIGNATURE VERIFICATION (RECOMMENDED FOR PROD)
    ===================================================== */
    const expectedSignature = crypto
      .createHmac("sha256", process.env.CASHFREE_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("base64");

    if (signature !== expectedSignature) {
      console.error("❌ Invalid webhook signature");
      return res.status(400).send("Invalid signature");
    }

    const payload = JSON.parse(rawBody);

    const orderId = payload?.data?.order?.order_id;
    const orderStatus = payload?.data?.order?.order_status;
    const cfPaymentId = payload?.data?.payment?.cf_payment_id;
    const amount = payload?.data?.payment?.payment_amount;

    if (!orderId) {
      return res.status(400).json({ error: "Missing order_id" });
    }

    console.log(`🔎 ORDER: ${orderId} | STATUS: ${orderStatus}`);

    /* =====================================================
       🛑 IDEMPOTENCY CHECK (avoid duplicate updates)
    ===================================================== */
    const [existing] = await db.query(
      `SELECT status FROM payments WHERE order_id = ?`,
      [orderId]
    );

    if (!existing.length) {
      console.log("⚠️ Payment record not found for order:", orderId);
      return res.sendStatus(200);
    }

    if (existing[0].status === "paid") {
      console.log("⚠️ Already processed:", orderId);
      return res.sendStatus(200);
    }

    /* =====================================================
       ✅ PAYMENT SUCCESS FLOW
    ===================================================== */
    if (orderStatus === "PAID") {
      await db.query(
        `UPDATE payments 
         SET status = 'paid',
             cf_payment_id = ?,
             amount = ?,
             updated_at = NOW()
         WHERE order_id = ?`,
        [cfPaymentId, amount, orderId]
      );

      const [rows] = await db.query(
        `SELECT booking_id FROM payments WHERE order_id = ? LIMIT 1`,
        [orderId]
      );

      const bookingId = rows[0]?.booking_id;

      if (bookingId) {
        await db.query(
          `UPDATE bookings 
           SET payment_status = 'paid'
           WHERE id = ?`,
          [bookingId]
        );

        console.log("🏠 Booking updated:", bookingId);
      }

      console.log("✅ PAYMENT STORED SUCCESSFULLY");
    }

    /* =====================================================
       ❌ PAYMENT FAILED FLOW (optional but recommended)
    ===================================================== */
    if (orderStatus === "FAILED") {
      await db.query(
        `UPDATE payments 
         SET status = 'failed', updated_at = NOW()
         WHERE order_id = ?`,
        [orderId]
      );

      console.log("❌ PAYMENT FAILED:", orderId);
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("🔥 WEBHOOK ERROR:", err);
    res.sendStatus(500);
  }
};