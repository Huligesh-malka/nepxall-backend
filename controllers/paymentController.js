const QRCode = require("qrcode");
const db = require("../db");

//////////////////////////////////////////////////////
// CREATE UPI PAYMENT
//////////////////////////////////////////////////////
exports.createPayment = async (req, res) => {
  try {
    // 🔥 ADD includeAgreement (NEW)
    const { bookingId, includeAgreement } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: "bookingId required" });
    }

    // ✅ 1. Get real booking data
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

    // 🔥 ORIGINAL AMOUNT
    let amount = rent + deposit + maintenance + platformFee;

    // 🔥 ADD AGREEMENT (ONLY ADD THIS)
    if (includeAgreement) {
      amount += 500; // agreement charge
    }

    if (amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    // ✅ 3. Create Order
    const orderId = `order_${bookingId}_${Date.now()}`;
    const upiId = "huligeshmalka-1@oksbi";
    const merchantName = "Nepxall";

    // 🔥 NOW QR WILL HAVE CORRECT AMOUNT
    const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&tr=${orderId}&tn=${orderId}&am=${amount}&cu=INR`;
    const qr = await QRCode.toDataURL(upiLink);

    // ✅ 4. Save payment
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

exports.verifyPayment = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    //////////////////////////////////////////////////////
    // 1. ADMIN CHECK
    //////////////////////////////////////////////////////
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const { orderId } = req.params;

    //////////////////////////////////////////////////////
    // 2. GET PAYMENT + BOOKING DATA
    //////////////////////////////////////////////////////
    const [[paymentData]] = await connection.query(
      `SELECT 
        p.booking_id, 
        p.amount,
        p.status AS payment_status,
        b.pg_id, 
        b.user_id, 
        b.owner_id, 
        b.room_id,
        b.check_in_date 
       FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       WHERE p.order_id = ? FOR UPDATE`,
      [orderId]
    );

    if (!paymentData) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    //////////////////////////////////////////////////////
    // 🔒 PREVENT DOUBLE APPROVE
    //////////////////////////////////////////////////////
    if (paymentData.payment_status === "paid") {
      return res.status(400).json({
        success: false,
        message: "Payment already verified"
      });
    }

    //////////////////////////////////////////////////////
    // 3. UPDATE PAYMENT → PAID
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE payments 
       SET status='paid', verified_by_admin=TRUE 
       WHERE order_id=?`,
      [orderId]
    );

    //////////////////////////////////////////////////////
    // 4. UPDATE BOOKING → CONFIRMED
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE bookings 
       SET status='confirmed', 
           owner_amount=?, 
           owner_settlement='PENDING' 
       WHERE id=?`,
      [paymentData.amount, paymentData.booking_id]
    );

    //////////////////////////////////////////////////////
    // 🔥 5. ALWAYS INSERT NEW PG_USERS (FINAL LOGIC)
    //////////////////////////////////////////////////////
    await connection.query(
      `INSERT INTO pg_users 
      (owner_id, pg_id, room_id, user_id, join_date, status, booking_id)
      VALUES (?,?,?,?,?, 'ACTIVE', ?)`,
      [
        paymentData.owner_id,
        paymentData.pg_id,
        paymentData.room_id || null,
        paymentData.user_id,
        paymentData.check_in_date,
        paymentData.booking_id
      ]
    );

    //////////////////////////////////////////////////////
    // 6. UPDATE ROOM OCCUPANCY
    //////////////////////////////////////////////////////
    if (paymentData.room_id) {
      await connection.query(
        `UPDATE pg_rooms 
         SET occupied_seats = occupied_seats + 1 
         WHERE id=?`,
        [paymentData.room_id]
      );
    }

    //////////////////////////////////////////////////////
    // ✅ COMMIT
    //////////////////////////////////////////////////////
    await connection.commit();

    res.json({
      success: true,
      message: "Payment verified. User is now ACTIVE in PG."
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ VERIFY PAYMENT ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.sqlMessage || err.message
    });

  } finally {
    connection.release();
  }
};
//////////////////////////////////////////////////////
// ADMIN REJECT PAYMENT
//////////////////////////////////////////////////////
exports.rejectPayment = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    //////////////////////////////////////////////////////
    // ✅ ADMIN CHECK
    //////////////////////////////////////////////////////
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false });
    }

    const { orderId } = req.params;

    //////////////////////////////////////////////////////
    // ✅ GET PAYMENT + BOOKING
    //////////////////////////////////////////////////////
    const [[data]] = await connection.query(
      `SELECT p.booking_id, b.user_id, b.pg_id, b.room_id
       FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       WHERE p.order_id=? FOR UPDATE`,
      [orderId]
    );

    if (!data) {
      throw new Error("Payment not found");
    }

    const { booking_id, room_id } = data;

    //////////////////////////////////////////////////////
    // ❌ UPDATE PAYMENT → REJECTED
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE payments 
       SET status='rejected', verified_by_admin=FALSE 
       WHERE order_id=?`,
      [orderId]
    );

    //////////////////////////////////////////////////////
    // 🔥 FIXED: KEEP BOOKING APPROVED (IMPORTANT)
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE bookings 
       SET status='approved',
           owner_settlement=NULL,
           settlement_date=NULL
       WHERE id=?`,
      [booking_id]
    );

    //////////////////////////////////////////////////////
    // ❌ REMOVE USER FROM PG
    //////////////////////////////////////////////////////
    await connection.query(
      `DELETE FROM pg_users 
       WHERE booking_id=?`,
      [booking_id]
    );

    //////////////////////////////////////////////////////
    // ❌ DECREASE ROOM OCCUPANCY
    //////////////////////////////////////////////////////
    if (room_id) {
      await connection.query(
        `UPDATE pg_rooms 
         SET occupied_seats = GREATEST(occupied_seats - 1, 0)
         WHERE id=?`,
        [room_id]
      );
    }

    //////////////////////////////////////////////////////
    // ✅ COMMIT
    //////////////////////////////////////////////////////
    await connection.commit();

    res.json({
      success: true,
      message: "Payment rejected. User can pay again."
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ REJECT ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  } finally {
    connection.release();
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

        /* USER */
        COALESCE(u.name, b.name, 'Guest User') AS reg_name,
        COALESCE(u.phone, b.phone, 'N/A') AS reg_phone,

        /* BOOKING */
        b.room_type AS sharing,
        b.check_in_date,

        /* 🔥 ADD THESE (IMPORTANT) */
        b.rent_amount,
        b.security_deposit,
        b.maintenance_amount,

        /* TOTAL */
        (b.rent_amount + b.security_deposit + b.maintenance_amount) AS total_amount,

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







// ================= GET ALL REFUNDS =================
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


// ================= UPDATE REFUND STATUS =================
exports.updateRefundStatus = async (req, res) => {
  try {
    const { refundId } = req.params;
    const { status } = req.body;

    // 🔥 VALID STATUS CHECK
    const validStatuses = ["pending", "approved", "paid", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // 🔥 CHECK REFUND EXISTS
    const [[refund]] = await db.query(
      "SELECT * FROM refunds WHERE id=?",
      [refundId]
    );

    if (!refund) {
      return res.status(404).json({ message: "Refund not found" });
    }

    // 🔥 UPDATE STATUS
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