const QRCode = require("qrcode");
const db = require("../db");
const path = require("path");

// Cashfree Payment Gateway Configuration - CORRECT VERSION
const { Cashfree, CFEnvironment } = require("cashfree-pg");

const cashfree = new Cashfree(
  CFEnvironment.PRODUCTION,
  process.env.CASHFREE_APP_ID,
  process.env.CASHFREE_SECRET_KEY
);

//////////////////////////////////////////////////////
// CREATE UPI PAYMENT
//////////////////////////////////////////////////////
exports.createPayment = async (req, res) => {
  try {
    const { bookingId, includeAgreement } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: "bookingId required" });
    }

    const [[booking]] = await db.query(
      `SELECT 
        user_id, 
        rent_amount, 
        security_deposit, 
        maintenance_amount, 
        platform_fee 
      FROM bookings 
      WHERE id = ?`,
      [bookingId]
    );

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const rent = parseFloat(booking.rent_amount) || 0;
    const deposit = parseFloat(booking.security_deposit) || 0;
    const maintenance = parseFloat(booking.maintenance_amount) || 0;
    const platformFee = parseFloat(booking.platform_fee) || 0;

    let amount = rent + deposit + maintenance + platformFee;

    if (includeAgreement) {
      amount += 500;
    }

    if (amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const orderId = `order_${bookingId}_${Date.now()}`;
    const upiId = "huligeshmalka-1@oksbi";
    const merchantName = "Nepxall";

    const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&tr=${orderId}&tn=${orderId}&am=${amount}&cu=INR`;
    const qr = await QRCode.toDataURL(upiLink);

    await db.query(
      `INSERT INTO payments (booking_id, user_id, order_id, amount, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', NOW())`,
      [bookingId, booking.user_id, orderId, amount]
    );

    res.json({
      success: true,
      orderId,
      amount,
      upiLink,
      qr
    });

  } catch (err) {
    console.error("CREATE PAYMENT ERROR:", err);
    res.status(500).json({ success: false });
  }
};

//////////////////////////////////////////////////////
// CREATE CASHFREE ORDER
//////////////////////////////////////////////////////
exports.createCashfreeOrder = async (req, res) => {
  try {
    const {
      bookingId,
      amount,
      customerId,
      customerPhone
    } = req.body;

    if (!bookingId || !amount || !customerPhone) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // ✅ STEP 1 — ADD PLATFORM FEE
    const bookingAmount = 1000;

const platformFee = 99;

const totalAmount = 1099;

    const order_id = "order_" + bookingId + "_" + Date.now();

    // ✅ STEP 2 — USE totalAmount INSTEAD OF amount
    await db.query(
      `INSERT INTO payments (booking_id, user_id, order_id, amount, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', NOW())`,
      [
        bookingId,
        req.user.id,
        order_id,
        totalAmount  // ← Changed: using totalAmount instead of amount
      ]
    );

    const request = {
      order_id,
      order_amount: totalAmount,  // ✅ STEP 3 — USE totalAmount INSTEAD OF amount
      order_currency: "INR",
      customer_details: {
        customer_id: String(customerId || req.user.id),
        customer_phone: String(customerPhone),
        customer_email: "support@nepxall.com"
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL || "https://nepxall.com"}/payment-success?order_id={order_id}`
      }
    };

    console.log("CASHFREE REQUEST:", JSON.stringify(request, null, 2));

    const response = await cashfree.PGCreateOrder(request);

    console.log("CASHFREE RESPONSE:", response.data);

    return res.json({
      success: true,
      payment_session_id: response.data.payment_session_id,
      order_id
    });

  } catch (err) {
    console.error("CASHFREE CREATE ERROR:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: "Cashfree order creation failed"
    });
  }
};




//////////////////////////////////////////////////////
// VERIFY CASHFREE PAYMENT (AUTO PAYMENT VERSION)
//////////////////////////////////////////////////////
exports.verifyCashfreePayment = async (req, res) => {

  const connection = await db.getConnection();

  try {

    await connection.beginTransaction();

    const { orderId } = req.params;

    console.log("VERIFY ORDER:", orderId);

    //////////////////////////////////////////////////////
    // FETCH PAYMENT FROM CASHFREE
    //////////////////////////////////////////////////////
    const response = await cashfree.PGOrderFetchPayments(orderId);

    const payments = response.data || [];

    console.log(
      "VERIFY RESPONSE:",
      JSON.stringify(payments, null, 2)
    );

    let isPaid = false;

    //////////////////////////////////////////////////////
    // CHECK PAYMENT STATUS
    //////////////////////////////////////////////////////
    if (Array.isArray(payments)) {

      isPaid = payments.some(
        payment =>
          ["SUCCESS", "PAID"].includes(
            payment.payment_status
          )
      );

    } else if (
      ["SUCCESS", "PAID"].includes(
        payments.payment_status
      )
    ) {

      isPaid = true;

    }

    console.log("IS PAID:", isPaid);

    //////////////////////////////////////////////////////
    // PAYMENT NOT COMPLETED
    //////////////////////////////////////////////////////
    if (!isPaid) {

      await connection.rollback();

      return res.json({
        success: true,
        isPaid: false,
        message: "Payment still pending"
      });

    }

    //////////////////////////////////////////////////////
    // GET PAYMENT FROM DB
    //////////////////////////////////////////////////////
    const [[existingPayment]] = await connection.query(
      `
      SELECT
        id,
        status,
        booking_id,
        amount
      FROM payments
      WHERE order_id=?
      FOR UPDATE
      `,
      [orderId]
    );

    if (!existingPayment) {

      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });

    }

    //////////////////////////////////////////////////////
    // ALREADY VERIFIED
    //////////////////////////////////////////////////////
    if (existingPayment.status === "paid") {

      await connection.commit();

      return res.json({
        success: true,
        isPaid: true,
        message: "Payment already verified"
      });

    }

    //////////////////////////////////////////////////////
    // UPDATE PAYMENT STATUS
    //////////////////////////////////////////////////////
    await connection.query(
      `
      UPDATE payments
      SET status='paid',
          submitted_at=NOW()
      WHERE order_id=?
      `,
      [orderId]
    );

    //////////////////////////////////////////////////////
    // GET BOOKING
    //////////////////////////////////////////////////////
    const [[booking]] = await connection.query(
      `
      SELECT
        b.id,
        b.pg_id,
        b.user_id,
        b.owner_id,
        b.room_id,
        b.check_in_date
      FROM bookings b
      WHERE b.id=?
      FOR UPDATE
      `,
      [existingPayment.booking_id]
    );

    //////////////////////////////////////////////////////
    // UPDATE BOOKING
    //////////////////////////////////////////////////////
    if (booking) {

      await connection.query(
        `
        UPDATE bookings
        SET status='confirmed',
            owner_amount=?,
            owner_settlement='PENDING'
        WHERE id=?
        `,
        [
          1000,
          booking.id
        ]
      );

      ////////////////////////////////////////////////////
      // CREATE PG USER
      ////////////////////////////////////////////////////
      const [[existingUser]] = await connection.query(
        `
        SELECT id
        FROM pg_users
        WHERE booking_id=?
        `,
        [booking.id]
      );

      if (!existingUser) {

        await connection.query(
          `
          INSERT INTO pg_users
          (
            owner_id,
            pg_id,
            room_id,
            user_id,
            join_date,
            status,
            booking_id
          )
          VALUES
          (
            ?, ?, ?, ?, ?, 'ACTIVE', ?
          )
          `,
          [
            booking.owner_id,
            booking.pg_id,
            booking.room_id || null,
            booking.user_id,
            booking.check_in_date,
            booking.id
          ]
        );

      }

      ////////////////////////////////////////////////////
      // UPDATE ROOM OCCUPANCY
      ////////////////////////////////////////////////////
      if (booking.room_id) {

        await connection.query(
          `
          UPDATE pg_rooms
          SET occupied_seats = occupied_seats + 1
          WHERE id=?
          `,
          [booking.room_id]
        );

      }

    }

    //////////////////////////////////////////////////////
    // COMMIT
    //////////////////////////////////////////////////////
    await connection.commit();

    console.log(
      "✅ PAYMENT VERIFIED:",
      orderId
    );

    return res.json({
      success: true,
      isPaid: true,
      message: "Payment verified successfully"
    });

  } catch (err) {

    await connection.rollback();

    console.error(
      "VERIFY PAYMENT ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({
      success: false,
      message: "Payment verification failed"
    });

  } finally {

    connection.release();

  }

};

//////////////////////////////////////////////////////
// GET USER PAYMENT STATUS
//////////////////////////////////////////////////////
exports.getUserPaymentStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const [rows] = await db.query(
      `
      SELECT 
        status, 
        order_id, 
        utr, 
        created_at, 
        submitted_at 
      FROM payments 
      WHERE booking_id = ?
      ORDER BY 
        CASE 
          WHEN status = 'paid' THEN 1
          WHEN status = 'submitted' THEN 2
          WHEN status = 'pending' THEN 3
          WHEN status = 'rejected' THEN 4
          ELSE 5
        END,
        created_at DESC
      LIMIT 1
      `,
      [bookingId]
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: "No payment found"
      });
    }

    return res.json({
      success: true,
      data: rows[0]
    });

  } catch (err) {
    console.error("❌ PAYMENT STATUS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment status"
    });
  }
};

//////////////////////////////////////////////////////
// GET AGREEMENT STATUS
//////////////////////////////////////////////////////
exports.getAgreementStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const [[row]] = await db.query(`
      SELECT 
        b.id,
        b.rent_amount,
        b.security_deposit,
        b.maintenance_amount,
        b.platform_fee,
        p.amount
      FROM bookings b
      LEFT JOIN payments p 
        ON p.booking_id = b.id 
        AND p.status = 'paid'
      WHERE b.id = ?
    `, [bookingId]);

    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const baseAmount =
      Number(row.rent_amount || 0) +
      Number(row.security_deposit || 0) +
      Number(row.maintenance_amount || 0) +
      Number(row.platform_fee || 0);

    const hasAgreement = Number(row.amount) > baseAmount;

    res.json({
      success: true,
      hasAgreement
    });

  } catch (err) {
    console.error("Agreement status error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to get agreement status"
    });
  }
};

//////////////////////////////////////////////////////
// GET ADMIN PAYMENTS (READ ONLY - NO VERIFICATION)
//////////////////////////////////////////////////////
exports.getAdminPayments = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        p.order_id,
        p.amount,
        p.status,
        p.created_at,
        p.submitted_at,
        p.booking_id,
        p.utr,
        p.screenshot,

        /* USER */
        COALESCE(u.name, b.name, 'Guest User') AS reg_name,
        COALESCE(u.phone, b.phone, 'N/A') AS reg_phone,

        /* BOOKING */
        b.room_type AS sharing,
        b.check_in_date,

        /* BASE AMOUNT */
        b.rent_amount,
        b.security_deposit,
        b.maintenance_amount,

        /* DETECT AGREEMENT PAID */
        CASE 
          WHEN p.amount > (b.rent_amount + b.security_deposit + b.maintenance_amount + b.platform_fee)
          THEN 1
          ELSE 0
        END AS agreement_paid,

        /* AGREEMENT FEE */
        CASE 
          WHEN p.amount > (b.rent_amount + b.security_deposit + b.maintenance_amount + b.platform_fee)
          THEN 500
          ELSE 0
        END AS agreement_fee,

        /* FINAL TOTAL */
        CASE 
          WHEN p.amount > (b.rent_amount + b.security_deposit + b.maintenance_amount + b.platform_fee)
          THEN (b.rent_amount + b.security_deposit + b.maintenance_amount + 500)
          ELSE (b.rent_amount + b.security_deposit + b.maintenance_amount)
        END AS total_amount,

        /* PG */
        pg.pg_name

      FROM payments p
      LEFT JOIN bookings b ON b.id = p.booking_id
      LEFT JOIN users u ON u.id = b.user_id
      LEFT JOIN pgs pg ON pg.id = b.pg_id
      ORDER BY p.created_at DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error("❌ ADMIN PAYMENTS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load payments"
    });
  }
};

//////////////////////////////////////////////////////
// GET ALL REFUNDS
//////////////////////////////////////////////////////
exports.getAllRefunds = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        r.*,
        u.name,
        u.phone,
        p.pg_name,
        b.id AS booking_id,
        pay.order_id
      FROM refunds r
      JOIN users u ON u.id = r.user_id
      JOIN bookings b ON b.id = r.booking_id
      JOIN pgs p ON p.id = b.pg_id
      LEFT JOIN payments pay 
        ON pay.booking_id = b.id
        AND pay.created_at = (
          SELECT MAX(created_at) 
          FROM payments 
          WHERE booking_id = b.id
        )
      ORDER BY r.created_at DESC
    `);

    res.json(rows);

  } catch (err) {
    console.error("❌ GET REFUNDS ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

//////////////////////////////////////////////////////
// UPDATE REFUND STATUS
//////////////////////////////////////////////////////
exports.updateRefundStatus = async (req, res) => {
  try {
    const { refundId } = req.params;
    const { status } = req.body;

    const validStatuses = ["pending", "approved", "paid", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const [[refund]] = await db.query(
      "SELECT * FROM refunds WHERE id=?",
      [refundId]
    );

    if (!refund) {
      return res.status(404).json({ message: "Refund not found" });
    }

    await db.query(
      "UPDATE refunds SET status=? WHERE id=?",
      [status, refundId]
    );

    res.json({
      success: true,
      message: `Refund ${status} successfully`
    });

  } catch (err) {
    console.error("❌ UPDATE REFUND ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

//////////////////////////////////////////////////////
// REQUEST REFUND
//////////////////////////////////////////////////////
exports.requestRefund = async (req, res) => {
  try {
    const { bookingId, reason } = req.body;
    const userId = req.user.id;

    if (!bookingId || !reason) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await db.query(
      `INSERT INTO refunds (booking_id, user_id, reason, status, created_at)
      VALUES (?, ?, ?, 'pending', NOW())`,
      [bookingId, userId, reason]
    );

    res.json({
      success: true,
      message: "Refund request submitted"
    });

  } catch (err) {
    console.error("❌ REQUEST REFUND ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};