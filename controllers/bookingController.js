const db = require("../db");

//////////////////////////////////////////////////////
// 🧑 CREATE BOOKING → PRODUCTION SAFE
//////////////////////////////////////////////////////

exports.createBooking = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { check_in_date, room_type } = req.body;
    const userId = req.user.id;

    if (!check_in_date || !room_type) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    //////////////////////////////////////////////////////
    // 🔥 STEP 1: AUTO EXPIRE OLD PENDING BOOKINGS
    //////////////////////////////////////////////////////
    await db.query(`
      UPDATE bookings
      SET status = 'expired'
      WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL 24 HOUR
    `);

    //////////////////////////////////////////////////////
    // 🔐 STEP 2: BLOCK ANY ACTIVE BOOKING (IMPORTANT FIX)
    //////////////////////////////////////////////////////
    const [[existing]] = await db.query(`
      SELECT id, status FROM bookings 
      WHERE user_id = ?
      AND pg_id = ?
      AND status IN ('pending','approved','confirmed')
      LIMIT 1
    `, [userId, pgId]);

    if (existing) {
      return res.status(400).json({
        message: `You already have a ${existing.status} booking for this PG`
      });
    }

    //////////////////////////////////////////////////////
    // 🔐 STEP 3: BLOCK IF USER IS ALREADY STAYING
    //////////////////////////////////////////////////////
    const [[activeStay]] = await db.query(`
      SELECT id FROM pg_users
      WHERE user_id=? AND pg_id=? AND status='ACTIVE'
      LIMIT 1
    `, [userId, pgId]);

    if (activeStay) {
      return res.status(400).json({
        message: "You are already staying in this PG."
      });
    }

    //////////////////////////////////////////////////////
    // 👤 GET USER
    //////////////////////////////////////////////////////
    const [[user]] = await db.query(
      "SELECT id, name, email, phone FROM users WHERE id=?",
      [userId]
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    //////////////////////////////////////////////////////
    // 🏠 GET PG
    //////////////////////////////////////////////////////
    const [[pg]] = await db.query(
      "SELECT * FROM pgs WHERE id=?",
      [pgId]
    );

    if (!pg) {
      return res.status(404).json({ message: "PG not found" });
    }

    //////////////////////////////////////////////////////
    // 💰 RENT CALCULATION
    //////////////////////////////////////////////////////
    let rent = 0;

    if (pg.pg_category === "pg") {
      if (room_type === "Single Sharing") rent = pg.single_sharing || 0;
      else if (room_type === "Double Sharing") rent = pg.double_sharing || 0;
      else if (room_type === "Triple Sharing") rent = pg.triple_sharing || 0;
      else if (room_type === "Four Sharing") rent = pg.four_sharing || 0;
      else if (room_type === "Single Room") rent = pg.single_room || 0;
      else if (room_type === "Double Room") rent = pg.double_room || 0;
    }

    const deposit = pg.deposit_amount || 0;
    const maintenance = pg.maintenance_amount || 0;

    //////////////////////////////////////////////////////
    // 📝 STEP 4: INSERT BOOKING
    //////////////////////////////////////////////////////
    const [result] = await db.query(
      `
      INSERT INTO bookings 
      (pg_id, user_id, owner_id, name, email, phone,
       check_in_date, room_type, rent_amount, security_deposit, maintenance_amount, status) 
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending')
      `,
      [
        pgId,
        userId,
        pg.owner_id,
        user.name,
        user.email,
        user.phone,
        check_in_date,
        room_type,
        rent,
        deposit,
        maintenance,
      ]
    );

    //////////////////////////////////////////////////////
    // ✅ SUCCESS RESPONSE
    //////////////////////////////////////////////////////
    res.json({
      success: true,
      bookingId: result.insertId,
      message: "Booking created successfully"
    });

  } catch (err) {
    console.error("❌ CREATE BOOKING ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};
//////////////////////////////////////////////////////
// 📜 USER BOOKINGS
//////////////////////////////////////////////////////
exports.getUserBookings = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
        b.id,
        b.pg_id,
        b.owner_id,
        b.room_id,
        b.room_type,
        b.check_in_date,
        b.status,
        b.rent_amount,
        b.security_deposit,
        b.maintenance_amount,
        (b.rent_amount + b.security_deposit + b.maintenance_amount) AS total_amount,
        b.kyc_verified,
        b.agreement_signed,
        b.move_in_completed,
        b.created_at,
        p.pg_name,
        p.city,
        p.area,
        p.contact_phone AS owner_phone,
        pr.room_no
        FROM bookings b
      JOIN pgs p ON p.id = b.pg_id
      LEFT JOIN pg_rooms pr ON pr.id = b.room_id
      WHERE b.user_id=?
      ORDER BY b.created_at DESC
      `,
      [req.user.id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//////////////////////////////////////////////////////
// 👑 OWNER BOOKINGS
//////////////////////////////////////////////////////
exports.getOwnerBookings = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
        b.*,
        p.pg_name,
        u.name AS tenant_name,
        u.phone AS tenant_phone
      FROM bookings b
      JOIN pgs p ON p.id = b.pg_id
      JOIN users u ON u.id = b.user_id
      WHERE b.owner_id=?
      ORDER BY b.created_at DESC
      `,
      [req.user.id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//////////////////////////////////////////////////////
// 👑 OWNER APPROVE / REJECT
//////////////////////////////////////////////////////
exports.updateBookingStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;

    //////////////////////////////////////////////////////
    // ✅ VALID STATUS
    //////////////////////////////////////////////////////
    const validStatuses = ['approved', 'rejected'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    //////////////////////////////////////////////////////
    // 🔥 GET CURRENT BOOKING
    //////////////////////////////////////////////////////
    const [[booking]] = await db.query(
      "SELECT status FROM bookings WHERE id=? AND owner_id=?",
      [bookingId, req.user.id]
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    //////////////////////////////////////////////////////
    // 🔥 LOGIC FIX
    //////////////////////////////////////////////////////
    let finalStatus = status;

    if (status === "rejected") {
      // ❌ DON'T BLOCK USER
      // 👉 keep booking alive for retry payment
      finalStatus = "approved"; 
    }

    //////////////////////////////////////////////////////
    // ✅ UPDATE BOOKING
    //////////////////////////////////////////////////////
    await db.query(
      "UPDATE bookings SET status=? WHERE id=? AND owner_id=?",
      [finalStatus, bookingId, req.user.id]
    );

    res.json({
      success: true,
      message: status === "rejected"
        ? "Booking kept approved (user can retry payment)"
        : "Booking approved"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
//////////////////////////////////////////////////////
// 💳 PAYMENT SUCCESS
//////////////////////////////////////////////////////
//////////////////////////////////////////////////////
// 💳 PAYMENT SUCCESS → UPDATED TO HANDLE ORDER_ID
//////////////////////////////////////////////////////
exports.markPaymentDone = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { room_id, order_id } = req.body;
    const userId = req.user.id;

    const [[booking]] = await db.query(
      "SELECT * FROM bookings WHERE id=? AND user_id=?",
      [bookingId, userId]
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // ✅ ONLY UPDATE BOOKING
    await db.query(
      `UPDATE bookings 
       SET status='confirmed', 
           room_id=?, 
           order_id=? 
       WHERE id=?`,
      [room_id || null, order_id || booking.order_id, bookingId]
    );

    // ✅ ROOM UPDATE (OPTIONAL KEEP)
    if (room_id) {
      await db.query(
        "UPDATE pg_rooms SET occupied_seats = occupied_seats + 1 WHERE id=?",
        [room_id]
      );
    }

    res.json({ 
      success: true, 
      message: "Payment submitted successfully"
    });

  } catch (err) {
    console.error("PAYMENT DONE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

//////////////////////////////////////////////////////
// 👑 ACTIVE TENANTS
//////////////////////////////////////////////////////
exports.getActiveTenantsByOwner = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
        pu.*,
        u.name,
        u.phone,
        p.pg_name
      FROM pg_users pu
      JOIN users u ON u.id = pu.user_id
      JOIN pgs p ON p.id = pu.pg_id
      WHERE pu.owner_id=? AND pu.status='ACTIVE'
      `,
      [req.user.id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getUserActiveStay = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.query(`
      SELECT 
        b.id,

        /* PAYMENT */
        (SELECT p.order_id 
         FROM payments p 
         WHERE p.booking_id = b.id 
           AND p.status = 'paid'
         ORDER BY p.id DESC LIMIT 1) AS order_id,

        (SELECT p.submitted_at 
         FROM payments p 
         WHERE p.booking_id = b.id 
           AND p.status = 'paid'
         ORDER BY p.id DESC LIMIT 1) AS paid_date,

        /* PG DETAILS */
        pg.pg_name,
        pr.room_no,
        b.room_type,
        b.check_in_date AS join_date,

        /* AMOUNTS */
        b.rent_amount,
        b.security_deposit AS deposit_amount,
        b.maintenance_amount,
        (b.rent_amount + b.maintenance_amount) AS monthly_total,

        /* ✅ FIXED REFUND (LATEST ONLY) */
        r.status AS refund_status,
        r.user_approval,
        r.amount AS refund_amount,
        r.refund_type,

        /* ✅ JOIN STATUS */
        (SELECT COUNT(*) 
         FROM pg_checkins pc 
         WHERE pc.booking_id = b.id) AS is_joined,

        'ACTIVE' AS status

      FROM bookings b
      JOIN pgs pg ON pg.id = b.pg_id
      LEFT JOIN pg_rooms pr ON pr.id = b.room_id

      /* 🔥 IMPORTANT FIX (LATEST REFUND ONLY) */
      LEFT JOIN refunds r 
        ON r.id = (
          SELECT r2.id
          FROM refunds r2
          WHERE r2.booking_id = b.id
          ORDER BY r2.created_at DESC
          LIMIT 1
        )

      WHERE b.user_id = ?
        AND b.status IN ('confirmed','left')

        AND EXISTS (
          SELECT 1 FROM payments p 
          WHERE p.booking_id = b.id 
            AND p.status = 'paid'
        )

      ORDER BY b.updated_at DESC
    `, [userId]);

    res.json(rows);

  } catch (err) {
    console.error("GET ACTIVE STAY ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};
exports.getReceiptDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.id;

    const [rows] = await db.query(
      `SELECT 
        b.id AS receipt_no,
        b.order_id, 
        b.updated_at AS verified_date,
        u.name AS tenant_name,
        u.phone AS tenant_phone,
        p.pg_name,
        pr.room_no,
        b.room_type,
        p.location,

        /* SEND ALL AMOUNTS */
        b.rent_amount,
        b.security_deposit,
        b.maintenance_amount,

        /* TOTAL */
        (b.rent_amount + b.security_deposit + b.maintenance_amount) AS total_amount,

        b.status
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      JOIN pgs p ON p.id = b.pg_id
      LEFT JOIN pg_rooms pr ON pr.id = b.room_id
      WHERE b.id = ? AND b.user_id = ? AND b.status = 'confirmed'`,
      [bookingId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Receipt not found or not yet verified." });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.requestRefund = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { bookingId, reason, upi_id } = req.body;
    const userId = req.user.id;

    //////////////////////////////////////////////////////
    // ✅ VALIDATION
    //////////////////////////////////////////////////////
    if (!bookingId || !reason || !upi_id) {
      return res.status(400).json({
        message: "Booking ID, reason and UPI ID are required"
      });
    }

    //////////////////////////////////////////////////////
    // ✅ CHECK BOOKING
    //////////////////////////////////////////////////////
    const [[booking]] = await connection.query(
      "SELECT * FROM bookings WHERE id=? AND user_id=?",
      [bookingId, userId]
    );

    if (!booking) throw new Error("Booking not found");

    //////////////////////////////////////////////////////
    // ❌ BLOCK DUPLICATE
    //////////////////////////////////////////////////////
    const [[existing]] = await connection.query(
      `SELECT * FROM refunds 
       WHERE booking_id=? 
       ORDER BY id DESC LIMIT 1`,
      [bookingId]
    );

    if (existing && existing.status !== "rejected") {
      throw new Error("Refund already requested");
    }

    //////////////////////////////////////////////////////
    // ✅ CALCULATE AMOUNT
    //////////////////////////////////////////////////////
    const amount =
      (Number(booking.rent_amount) || 0) +
      (Number(booking.security_deposit) || 0) +
      (Number(booking.maintenance_amount) || 0);

    //////////////////////////////////////////////////////
    // 🔥 UPDATE PG_USERS (IMPORTANT FIX)
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE pg_users 
       SET status='LEAVING',
           vacate_status='requested',
           vacate_reason=?,
           vacate_request_date=NOW()
       WHERE booking_id=?`,
      [reason, bookingId]
    );

    //////////////////////////////////////////////////////
    // ✅ INSERT REFUND
    //////////////////////////////////////////////////////
    await connection.query(
      `INSERT INTO refunds 
      (booking_id, user_id, amount, reason, upi_id, refund_type, status, user_approval)
      VALUES (?,?,?,?,?,'FULL','pending','accepted')`,
      [bookingId, userId, amount, reason, upi_id]
    );

    //////////////////////////////////////////////////////
    // ✅ COMMIT
    //////////////////////////////////////////////////////
    await connection.commit();

    res.json({
      success: true,
      message: "Refund request submitted (Vacate started)",
      status: "pending"
    });

  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    connection.release();
  }
};

exports.requestVacate = async (req, res) => {
  try {
    const {
      bookingId,
      vacate_date,
      reason,
      account_number,
      ifsc_code,
      upi_id
    } = req.body;

    const userId = req.user.id;

    //////////////////////////////////////////////////////
    // ✅ VALIDATION
    //////////////////////////////////////////////////////
    if (!bookingId || !vacate_date || !reason) {
      return res.status(400).json({
        message: "Booking ID, vacate date and reason required"
      });
    }

    //////////////////////////////////////////////////////
    // ✅ CHECK BOOKING
    //////////////////////////////////////////////////////
    const [[booking]] = await db.query(
      "SELECT * FROM bookings WHERE id=? AND user_id=?",
      [bookingId, userId]
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    //////////////////////////////////////////////////////
    // ✅ CHECK PG USER
    //////////////////////////////////////////////////////
    const [[pgUser]] = await db.query(
      "SELECT * FROM pg_users WHERE booking_id=?",
      [bookingId]
    );

    if (!pgUser) {
      return res.status(404).json({ message: "PG user record not found" });
    }

    //////////////////////////////////////////////////////
    // ✅ CHECK LAST REFUND (🔥 IMPORTANT FIX)
    //////////////////////////////////////////////////////
    const [[lastRefund]] = await db.query(
      `SELECT status FROM refunds 
       WHERE booking_id=? 
       ORDER BY id DESC LIMIT 1`,
      [bookingId]
    );

    // ❌ BLOCK only if NOT rejected
    if (
      pgUser.vacate_status === "requested" &&
      lastRefund &&
      lastRefund.status !== "rejected"
    ) {
      return res.status(400).json({
        message: "Vacate already requested"
      });
    }

    // ❌ BLOCK IF COMPLETED
    if (pgUser.vacate_status === "completed") {
      return res.status(400).json({
        message: "Already vacated"
      });
    }

    //////////////////////////////////////////////////////
    // ✅ UPDATE PG USER
    //////////////////////////////////////////////////////
    await db.query(
      `UPDATE pg_users 
       SET status='LEAVING',
           vacate_status='requested',
           vacate_reason=?,
           vacate_request_date=NOW(),
           move_out_date=? 
       WHERE booking_id=?`,
      [reason, vacate_date, bookingId]
    );

    //////////////////////////////////////////////////////
    // ✅ CALCULATE REFUND AMOUNT
    //////////////////////////////////////////////////////
    let refundAmount = booking.security_deposit || 0;

    //////////////////////////////////////////////////////
    // ✅ CHECK EXISTING REFUND
    //////////////////////////////////////////////////////
    const [[existingRefund]] = await db.query(
      `SELECT * FROM refunds 
       WHERE booking_id=? AND refund_type='DEPOSIT'
       ORDER BY created_at DESC LIMIT 1`,
      [bookingId]
    );

    //////////////////////////////////////////////////////
    // 🔁 UPDATE EXISTING
    //////////////////////////////////////////////////////
    if (existingRefund) {
      await db.query(
        `UPDATE refunds 
         SET status='pending',
             user_approval='pending',
             amount=?,
             upi_id=?,
             account_number=?,
             ifsc_code=?,
             created_at=NOW()
         WHERE id=?`,
        [
          refundAmount,
          upi_id,
          account_number,
          ifsc_code,
          existingRefund.id
        ]
      );
    } else {
      //////////////////////////////////////////////////////
      // ✅ INSERT NEW
      //////////////////////////////////////////////////////
      await db.query(
        `INSERT INTO refunds 
        (booking_id, user_id, amount, reason, upi_id, account_number, ifsc_code, refund_type, status, user_approval)
        VALUES (?,?,?,?,?,?,?,'DEPOSIT','pending','pending')`,
        [
          bookingId,
          userId,
          refundAmount,
          "Deposit refund after vacate",
          upi_id || null,
          account_number || null,
          ifsc_code || null
        ]
      );
    }

    res.json({
      success: true,
      message: "Vacate request submitted successfully"
    });

  } catch (err) {
    console.error("VACATE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};






exports.acceptRefund = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const userId = req.user.id;

    const [[refund]] = await db.query(
      `SELECT * FROM refunds 
       WHERE booking_id=? AND user_id=? 
       ORDER BY created_at DESC LIMIT 1`,
      [bookingId, userId]
    );

    if (!refund) {
      return res.status(404).json({ message: "Refund not found" });
    }

    if (refund.status !== "approved") {
      return res.status(400).json({
        message: "Refund not approved yet"
      });
    }

    await db.query(
      `UPDATE refunds 
       SET user_approval='accepted', status='pending'
       WHERE id=?`,
      [refund.id]
    );

    res.json({
      success: true,
      message: "Refund accepted"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
exports.rejectRefund = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const userId = req.user.id;

    const [[refund]] = await db.query(
      `SELECT * FROM refunds 
       WHERE booking_id=? AND user_id=? 
       ORDER BY created_at DESC LIMIT 1`,
      [bookingId, userId]
    );

    if (!refund) {
      return res.status(404).json({ message: "Refund not found" });
    }

    if (refund.status !== "approved") {
      return res.status(400).json({
        message: "Refund not approved yet"
      });
    }

    await db.query(
      `UPDATE refunds 
       SET user_approval='rejected', status='pending'
       WHERE id=?`,
      [refund.id]
    );

    res.json({
      success: true,
      message: "Refund rejected"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};