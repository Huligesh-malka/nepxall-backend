const QRCode = require("qrcode");
const db = require("../db");

//////////////////////////////////////////////////////
// CREATE UPI PAYMENT
//////////////////////////////////////////////////////
exports.createPayment = async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: "bookingId required" });
    }

    // ✅ 1. Get real booking data (Added user_id to the SELECT)
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

    // Convert string → number
    const rent = parseFloat(booking.rent_amount) || 0;
    const deposit = parseFloat(booking.security_deposit) || 0;
    const maintenance = parseFloat(booking.maintenance_amount) || 0;
    const platformFee = parseFloat(booking.platform_fee) || 0;
    const amount = rent + deposit + maintenance + platformFee;

    if (amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    // ✅ 3. Create Order
    const orderId = `order_${bookingId}_${Date.now()}`;
    const upiId = "huligeshmalka-1@oksbi";
    const merchantName = "Nepxall";

    const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&tr=${orderId}&tn=${orderId}&am=${amount}&cu=INR`;
    const qr = await QRCode.toDataURL(upiLink);

    // ✅ 4. Save payment (NOW INCLUDING user_id)
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
// GET ADMIN PAYMENTS (DETAILED VERSION)
exports.getAdminPayments = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        p.order_id,
        p.amount,
        p.status,
        p.created_at,
        p.submitted_at,
        p.utr,
        p.screenshot,
        p.verified_by_admin,

        /* Fix: Use 'u.name' and 'u.phone' from your verified users table */
        COALESCE(u.name, 'Guest User') AS reg_name,
        COALESCE(u.phone, 'No Phone') AS reg_phone,
        u.id AS user_registration_id,

        /* Booking Details */
        b.room_type AS sharing,

        /* PG Details */
        pg.pg_name

      FROM payments p
      LEFT JOIN bookings b ON b.id = p.booking_id
      /* Ensure this join matches your 'users' table structure */
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
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
exports.verifyPayment = async (req, res) => {
  try {
    // 1. Admin Authorization Check
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const { orderId } = req.params;

    // 2. Fetch all necessary data from Payment joined with Bookings
    // We fetch check_in_date and room_id to populate pg_users
    const [[paymentData]] = await db.query(
      `SELECT 
        p.booking_id, 
        p.amount, 
        b.pg_id, 
        b.user_id, 
        b.owner_id, 
        b.room_id,
        b.check_in_date 
       FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       WHERE p.order_id = ?`,
      [orderId]
    );

    if (!paymentData) {
      return res.status(404).json({ success: false, message: "Payment record not found" });
    }

    // 3. Update Payment Status
    await db.query(
      `UPDATE payments SET status='paid', verified_by_admin=TRUE WHERE order_id=?`,
      [orderId]
    );

    // 4. Update Booking Status
    await db.query(
      `UPDATE bookings 
       SET status='confirmed', 
           owner_amount=?, 
           owner_settlement='PENDING' 
       WHERE id=?`,
      [paymentData.amount, paymentData.booking_id]
    );

    // 5. Create/Update Active Stay in pg_users
    // Mapping: check_in_date -> join_date
    await db.query(
      `INSERT INTO pg_users (owner_id, pg_id, room_id, user_id, join_date, status)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE')
       ON DUPLICATE KEY UPDATE 
          status='ACTIVE', 
          join_date = VALUES(join_date),
          room_id = VALUES(room_id)`,
      [
        paymentData.owner_id,
        paymentData.pg_id,
        paymentData.room_id || null,
        paymentData.user_id,
        paymentData.check_in_date
      ]
    );

    res.json({
      success: true,
      message: "Payment verified. User stay is now ACTIVE."
    });

  } catch (err) {
    console.error("❌ VERIFY PAYMENT ERROR:", err);
    res.status(500).json({ 
      success: false, 
      message: "Internal Server Error",
      error: err.sqlMessage || err.message 
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


//////////////////////////////////////////////////////
// AUTO MATCH BANK TRANSACTION
//////////////////////////////////////////////////////
exports.matchBankTransaction = async (req, res) => {
  try {

    const { remark } = req.body;

    if (!remark) {
      return res.status(400).json({
        success:false,
        message:"remark required"
      });
    }

    const match = remark.match(/order_[0-9]+_[0-9]+/);

    if (!match) {
      return res.json({
        success:false,
        message:"order id not found"
      });
    }

    const orderId = match[0];

    await db.query(
      `UPDATE payments
       SET status='paid'
       WHERE order_id=?`,
      [orderId]
    );

    res.json({
      success:true,
      message:"payment matched"
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success:false
    });

  }
};



//////////////////////////////////////////////////////
// SUBMIT PAYMENT WITH SCREENSHOT (Matches your table)
//////////////////////////////////////////////////////
exports.submitPaymentWithScreenshot = async (req, res) => {
  try {
    const { orderId, utr } = req.body;
    const file = req.file;

    console.log("📸 Submitting payment with screenshot:", { 
      orderId, 
      utr, 
      fileExists: !!file,
      fileUrl: file?.path
    });

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId required"
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "Screenshot is required"
      });
    }

    // Check if payment exists
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

    // Get the Cloudinary URL
    const screenshotUrl = file.path;

    // Update payment - ALL columns exist in your table now!
    await db.query(
      `UPDATE payments 
       SET status='submitted', 
           utr=?, 
           screenshot=?,
           submitted_at=NOW() 
       WHERE order_id=?`,
      [utr || null, screenshotUrl, orderId]
    );

    console.log("✅ Payment submitted successfully. Screenshot URL:", screenshotUrl);

    res.json({
      success: true,
      message: "Payment submitted successfully. Waiting for admin verification.",
      screenshotUrl
    });

  } catch (err) {
    console.error("❌ SUBMIT PAYMENT ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to submit payment",
      error: err.message
    });
  }
};

//////////////////////////////////////////////////////
// GET USER PAYMENT STATUS (NEW)
//////////////////////////////////////////////////////
exports.getUserPaymentStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const [rows] = await db.query(
      `SELECT status, order_id, utr, created_at, submitted_at 
       FROM payments 
       WHERE booking_id = ?
       ORDER BY created_at DESC 
       LIMIT 1`,
      [bookingId]
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: "No payment found"
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });

  } catch (err) {
    console.error("❌ PAYMENT STATUS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment status"
    });
  }
};

//////////////////////////////////////////////////////
// VIEW PAYMENT SCREENSHOT (ADMIN ONLY - NEW)
//////////////////////////////////////////////////////
exports.viewPaymentScreenshot = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const { orderId } = req.params;

    const [rows] = await db.query(
      "SELECT screenshot FROM payments WHERE order_id=?",
      [orderId]
    );

    if (rows.length === 0 || !rows[0].screenshot) {
      return res.status(404).json({
        success: false,
        message: "Screenshot not found"
      });
    }

    // Send the image file
    res.sendFile(path.resolve(rows[0].screenshot));

  } catch (err) {
    console.error("❌ VIEW SCREENSHOT ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to view screenshot"
    });
  }
};

//////////////////////////////////////////////////////
// GET ADMIN PAYMENTS (UPDATED for your table)
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
        p.verified_by_admin,
        b.name AS tenant_name,
        b.phone,
        b.owner_id,
        pg.pg_name
      FROM payments p
      LEFT JOIN bookings b ON b.id = p.booking_id
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