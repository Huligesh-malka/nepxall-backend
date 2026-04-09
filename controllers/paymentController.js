const QRCode = require("qrcode");
const db = require("../db");

//////////////////////////////////////////////////////
// CREATE UPI PAYMENT
//////////////////////////////////////////////////////
exports.createPayment = async (req, res) => {
  try {
    const { bookingId, type } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: "bookingId required" });
    }

    //////////////////////////////////////////////////////
    // GET BOOKING
    //////////////////////////////////////////////////////
    const [[booking]] = await db.query(
      `SELECT 
        user_id, 
        rent_amount, 
        security_deposit, 
        maintenance_amount, 
        platform_fee,
        status
       FROM bookings 
       WHERE id = ?`,
      [bookingId]
    );

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    //////////////////////////////////////////////////////
    // CALCULATE TOTAL
    //////////////////////////////////////////////////////
    const rent = parseFloat(booking.rent_amount) || 0;
    const deposit = parseFloat(booking.security_deposit) || 0;
    const maintenance = parseFloat(booking.maintenance_amount) || 0;
    const platformFee = parseFloat(booking.platform_fee) || 0;

    const total = rent + deposit + maintenance + platformFee;

    let amount = 0;
    let paymentType = "";

    //////////////////////////////////////////////////////
    // TOKEN PAYMENT
    //////////////////////////////////////////////////////
    if (!type || type === "TOKEN") {
      amount = 1000;
      paymentType = "TOKEN";

      // ❌ Prevent duplicate token
      const [existing] = await db.query(
        `SELECT id FROM payments WHERE booking_id=? AND payment_type='TOKEN'`,
        [bookingId]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Token already paid"
        });
      }
    }

    //////////////////////////////////////////////////////
    // REMAINING PAYMENT
    //////////////////////////////////////////////////////
    if (type === "REMAINING") {
      amount = total - 1000;
      paymentType = "REMAINING";

      // ❌ Prevent remaining before token
      const [token] = await db.query(
        `SELECT id FROM payments 
         WHERE booking_id=? AND payment_type='TOKEN' AND status='paid'`,
        [bookingId]
      );

      if (token.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Please pay ₹1000 first"
        });
      }
    }

    //////////////////////////////////////////////////////
    // CREATE ORDER
    //////////////////////////////////////////////////////
    const orderId = `${paymentType.toLowerCase()}_${bookingId}_${Date.now()}`;
    const upiId = "huligeshmalka-1@oksbi";
    const merchantName = "Nepxall";

    const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(
      merchantName
    )}&tr=${orderId}&tn=${orderId}&am=${amount}&cu=INR`;

    const qr = await QRCode.toDataURL(upiLink);

    //////////////////////////////////////////////////////
    // SAVE PAYMENT
    //////////////////////////////////////////////////////
    await db.query(
      `INSERT INTO payments 
       (booking_id, user_id, order_id, amount, status, payment_type, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, NOW())`,
      [bookingId, booking.user_id, orderId, amount, paymentType]
    );

    res.json({
      success: true,
      orderId,
      amount,
      paymentType,
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
    const [[data]] = await connection.query(
      `SELECT 
        p.booking_id,
        p.amount,
        p.status,
        p.payment_type,
        b.pg_id,
        b.user_id,
        b.owner_id,
        b.room_id,
        b.check_in_date,
        b.status AS booking_status
       FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       WHERE p.order_id=? FOR UPDATE`,
      [orderId]
    );

    if (!data) {
      throw new Error("Payment not found");
    }

    //////////////////////////////////////////////////////
    // 🔒 PREVENT DOUBLE VERIFY
    //////////////////////////////////////////////////////
    if (data.status === "paid") {
      return res.status(400).json({
        success: false,
        message: "Payment already verified"
      });
    }

    //////////////////////////////////////////////////////
    // 3. MARK PAYMENT AS PAID
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE payments 
       SET status='paid', verified_by_admin=TRUE 
       WHERE order_id=?`,
      [orderId]
    );

    //////////////////////////////////////////////////////
    // 🔥 4. TOKEN PAYMENT LOGIC
    //////////////////////////////////////////////////////
    if (data.payment_type === "TOKEN") {

      // ❌ Prevent re-token
      if (data.booking_status === "PARTIAL_PAID") {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Token already processed"
        });
      }

      await connection.query(
        `UPDATE bookings 
         SET status='PARTIAL_PAID'
         WHERE id=?`,
        [data.booking_id]
      );

      await connection.commit();

      return res.json({
        success: true,
        type: "TOKEN_SUCCESS",
        message: "₹1000 received. Booking reserved."
      });
    }

    //////////////////////////////////////////////////////
    // 🔥 5. REMAINING PAYMENT LOGIC
    //////////////////////////////////////////////////////
    if (data.payment_type === "REMAINING") {

      // ❌ Prevent remaining without token
      if (data.booking_status !== "PARTIAL_PAID") {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Please complete token payment first"
        });
      }

      ////////////////////////////////////////////////////
      // ✅ CONFIRM BOOKING
      ////////////////////////////////////////////////////
      await connection.query(
        `UPDATE bookings 
         SET status='confirmed',
             owner_amount=?,
             owner_settlement='PENDING'
         WHERE id=?`,
        [data.amount, data.booking_id]
      );

      ////////////////////////////////////////////////////
      // 🔒 PREVENT DUPLICATE JOIN
      ////////////////////////////////////////////////////
      const [existing] = await connection.query(
        `SELECT id FROM pg_users WHERE booking_id=?`,
        [data.booking_id]
      );

      if (existing.length === 0) {

        //////////////////////////////////////////////////
        // ✅ INSERT USER
        //////////////////////////////////////////////////
        await connection.query(
          `INSERT INTO pg_users 
           (owner_id, pg_id, room_id, user_id, join_date, status, booking_id)
           VALUES (?,?,?,?,?, 'ACTIVE', ?)`,
          [
            data.owner_id,
            data.pg_id,
            data.room_id || null,
            data.user_id,
            data.check_in_date,
            data.booking_id
          ]
        );

        //////////////////////////////////////////////////
        // ✅ UPDATE ROOM OCCUPANCY
        //////////////////////////////////////////////////
        if (data.room_id) {
          await connection.query(
            `UPDATE pg_rooms 
             SET occupied_seats = occupied_seats + 1 
             WHERE id=?`,
            [data.room_id]
          );
        }
      }

      await connection.commit();

      return res.json({
        success: true,
        type: "FULL_SUCCESS",
        message: "Full payment done. User joined PG."
      });
    }

    //////////////////////////////////////////////////////
    // ❌ INVALID TYPE
    //////////////////////////////////////////////////////
    await connection.rollback();

    return res.status(400).json({
      success: false,
      message: "Invalid payment type"
    });

  } catch (err) {
    await connection.rollback();

    console.error("❌ VERIFY PAYMENT ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message || "Server error"
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


exports.getAdminPayments = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,

        /* USER */
        COALESCE(u.name, b.name, 'Guest User') AS reg_name,
        COALESCE(u.phone, b.phone, 'N/A') AS reg_phone,

        /* BOOKING */
        b.room_type AS sharing,
        b.check_in_date,

        /* PG */
        pg.pg_name,

        /* TOTAL AMOUNT */
        (b.rent_amount + b.security_deposit + b.maintenance_amount) AS total_amount,

        /* 🔥 INCLUDE submitted + paid */
        SUM(CASE 
          WHEN p.status IN ('paid','submitted') 
          THEN p.amount ELSE 0 END
        ) AS total_paid,

        /* 🔥 TOKEN */
        SUM(CASE 
          WHEN p.payment_type='TOKEN' 
          AND p.status IN ('paid','submitted') 
          THEN p.amount ELSE 0 END
        ) AS token_paid,

        /* 🔥 REMAINING */
        SUM(CASE 
          WHEN p.payment_type='REMAINING' 
          AND p.status IN ('paid','submitted') 
          THEN p.amount ELSE 0 END
        ) AS remaining_paid,

        /* LAST PAYMENT INFO */
        MAX(p.created_at) AS created_at,
        MAX(p.submitted_at) AS submitted_at,
        MAX(p.utr) AS utr,
        MAX(p.screenshot) AS screenshot,

        /* 🔥 LAST ORDER ID */
        SUBSTRING_INDEX(
          GROUP_CONCAT(p.order_id ORDER BY p.created_at DESC),
          ',', 1
        ) AS order_id,

        /* 🔥 LAST PAYMENT STATUS */
        SUBSTRING_INDEX(
          GROUP_CONCAT(p.status ORDER BY p.created_at DESC),
          ',', 1
        ) AS payment_status

      FROM bookings b
      LEFT JOIN payments p ON p.booking_id = b.id
      LEFT JOIN users u ON u.id = b.user_id
      LEFT JOIN pgs pg ON pg.id = b.pg_id

      GROUP BY b.id
      ORDER BY created_at DESC
    `);

    //////////////////////////////////////////////////////
    // 🔥 FORMAT RESPONSE
    //////////////////////////////////////////////////////
    const formatted = rows.map(r => {
      const total = Number(r.total_amount) || 0;
      const paid = Number(r.total_paid) || 0;
      const remaining = total - paid;

      let status = "NOT_PAID";

      if (paid > 0 && remaining > 0) {
        status = "PARTIAL_PAID";
      }

      if (remaining <= 0 && total > 0) {
        status = "FULLY_PAID";
      }

      return {
        ...r,
        total_amount: total,
        total_paid: paid,
        remaining_amount: remaining,
        status
      };
    });

    res.json({
      success: true,
      data: formatted
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