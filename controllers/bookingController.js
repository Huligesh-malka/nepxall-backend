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
    // 🔥 STEP 1: AUTO EXPIRE OLD BOOKINGS
    //////////////////////////////////////////////////////
    await db.query(`
      UPDATE bookings
      SET status = 'expired'
      WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL 24 HOUR
    `);

    //////////////////////////////////////////////////////
    // 🔐 STEP 2: BLOCK ONLY APPROVED / CONFIRMED
    //////////////////////////////////////////////////////
    const [[existing]] = await db.query(`
      SELECT id FROM bookings 
      WHERE user_id = ?
      AND pg_id = ?
      AND status IN ('approved','confirmed')
      LIMIT 1
    `, [userId, pgId]);

    if (existing) {
      return res.status(400).json({
        message: "Booking already approved or active. Complete current booking first."
      });
    }

    //////////////////////////////////////////////////////
    // 🔐 STEP 3: BLOCK IF USER ALREADY STAYING
    //////////////////////////////////////////////////////
    const [[activeStay]] = await db.query(`
      SELECT id FROM pg_users
      WHERE user_id=? AND status='ACTIVE'
      LIMIT 1
    `, [userId]);

    if (activeStay) {
      return res.status(400).json({
        message: "You are already staying in a PG. Vacate first."
      });
    }

    //////////////////////////////////////////////////////
    // 👤 USER
    //////////////////////////////////////////////////////
    const [[user]] = await db.query(
      "SELECT id, name, email, phone FROM users WHERE id=?",
      [userId]
    );

    //////////////////////////////////////////////////////
    // 🏠 PG
    //////////////////////////////////////////////////////
    const [[pg]] = await db.query(
      "SELECT * FROM pgs WHERE id=?",
      [pgId]
    );

    //////////////////////////////////////////////////////
    // 💰 RENT
    //////////////////////////////////////////////////////
    let rent = 0;

    if (pg.pg_category === "pg") {
      if (room_type === "Single Sharing") rent = pg.single_sharing || 0;
      if (room_type === "Double Sharing") rent = pg.double_sharing || 0;
      if (room_type === "Triple Sharing") rent = pg.triple_sharing || 0;
      if (room_type === "Four Sharing") rent = pg.four_sharing || 0;
      if (room_type === "Single Room") rent = pg.single_room || 0;
      if (room_type === "Double Room") rent = pg.double_room || 0;
    }

    const deposit = pg.deposit_amount || 0;
    const maintenance = pg.maintenance_amount || 0;

    //////////////////////////////////////////////////////
    // INSERT
    //////////////////////////////////////////////////////
    await db.query(
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

    res.json({
      success: true,
      message: "Booking created (pending)"
    });

  } catch (err) {
    console.error(err);
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

    const validStatuses = ['approved', 'rejected'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    await db.query(
      "UPDATE bookings SET status=? WHERE id=? AND owner_id=?",
      [status, bookingId, req.user.id]
    );

    res.json({ success: true });

  } catch (err) {
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

    const [rows] = await db.query(
      `
      SELECT 
        b.id,

        /* PAYMENT */
        MAX(p.order_id) AS order_id,
        MAX(p.submitted_at) AS paid_date,

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

        /* 🔥 FIXED REFUND DATA */
        r.status AS refund_status,
        r.user_approval,
        r.amount AS refund_amount,

        'ACTIVE' AS status

      FROM bookings b
      JOIN pgs pg ON pg.id = b.pg_id
      LEFT JOIN pg_rooms pr ON pr.id = b.room_id

      /* PAYMENT JOIN */
      LEFT JOIN payments p 
        ON p.booking_id = b.id 

      /* 🔥 REFUND JOIN (LATEST ONLY) */
      LEFT JOIN refunds r 
        ON r.booking_id = b.id
        AND r.created_at = (
          SELECT MAX(created_at) 
          FROM refunds 
          WHERE booking_id = b.id
        )

      WHERE b.user_id = ? 
        AND b.status IN ('confirmed','left')
        AND (p.status = 'paid' OR p.status = 'submitted')

      GROUP BY 
        b.id,
        pg.pg_name,
        pr.room_no,
        b.room_type,
        b.check_in_date,
        b.rent_amount,
        b.security_deposit,
        b.maintenance_amount,
        r.status,
        r.user_approval,
        r.amount

      ORDER BY b.updated_at DESC
      `,
      [userId]
    );

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
  try {
    const { bookingId, reason, upi_id } = req.body;
    const userId = req.user.id;

    // ✅ CHECK BOOKING
    const [[booking]] = await db.query(
      "SELECT * FROM bookings WHERE id=? AND user_id=?",
      [bookingId, userId]
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // 🔥 CHECK EXISTING REFUND
    const [[existing]] = await db.query(
      "SELECT * FROM refunds WHERE booking_id=?",
      [bookingId]
    );

    // ❌ BLOCK if already requested (except rejected)
    if (existing && existing.status !== "rejected") {
      return res.status(400).json({
        message: "Refund already requested",
        status: existing.status
      });
    }

    // 🔁 IF REJECTED → UPDATE INSTEAD OF INSERT
    if (existing && existing.status === "rejected") {
      await db.query(
        `UPDATE refunds 
         SET reason=?, upi_id=?, status='pending', created_at=NOW()
         WHERE booking_id=?`,
        [reason, upi_id, bookingId]
      );

      return res.json({
        success: true,
        message: "Refund re-request submitted",
        status: "pending"
      });
    }

    // ✅ CALCULATE AMOUNT SAFELY
    const amount =
      (Number(booking.rent_amount) || 0) +
      (Number(booking.security_deposit) || 0) +
      (Number(booking.maintenance_amount) || 0);

    // ✅ INSERT NEW REFUND
    await db.query(
      `INSERT INTO refunds (booking_id, user_id, amount, reason, upi_id)
       VALUES (?,?,?,?,?)`,
      [bookingId, userId, amount, reason, upi_id]
    );

    res.json({
      success: true,
      message: "Refund request submitted",
      status: "pending"
    });

  } catch (err) {
    console.error("❌ REFUND ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};



exports.requestVacate = async (req, res) => {
  try {
    const { bookingId, vacate_date, reason } = req.body;
    const userId = req.user.id;

    const [[booking]] = await db.query(
      "SELECT * FROM bookings WHERE id=? AND user_id=?",
      [bookingId, userId]
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    //////////////////////////////////////////////////////
    // 🔥 UPDATE BOOKING → LEFT
    //////////////////////////////////////////////////////
    await db.query(
      `UPDATE bookings SET status='left' WHERE id=?`,
      [bookingId]
    );

    //////////////////////////////////////////////////////
    // 🔥 FREE ROOM
    //////////////////////////////////////////////////////
    if (booking.room_id) {
      await db.query(
        `UPDATE pg_rooms 
         SET occupied_seats = occupied_seats - 1 
         WHERE id=?`,
        [booking.room_id]
      );
    }

    //////////////////////////////////////////////////////
    // 🔥 UPDATE PG USERS
    //////////////////////////////////////////////////////
    await db.query(
      `UPDATE pg_users 
       SET status='LEFT' 
       WHERE user_id=? AND pg_id=?`,
      [userId, booking.pg_id]
    );

    res.json({
      success: true,
      message: "Vacated successfully"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};





exports.acceptRefund = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const userId = req.user.id;

    const [[refund]] = await db.query(
      "SELECT * FROM refunds WHERE booking_id=? AND user_id=?",
      [bookingId, userId]
    );

    if (!refund) {
      return res.status(404).json({ message: "Refund not found" });
    }

    if (refund.status !== "approved") {
      return res.status(400).json({
        message: "Refund not approved by owner yet"
      });
    }

    // ✅ CHANGE HERE
    await db.query(
      `UPDATE refunds 
       SET user_approval='accepted', status='pending'
       WHERE booking_id=? AND user_id=?`,
      [bookingId, userId]
    );

    res.json({
      success: true,
      message: "Refund accepted. Waiting for owner payment"
    });

  } catch (err) {
    console.error("❌ ACCEPT REFUND ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};





exports.rejectRefund = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const userId = req.user.id;

    // ✅ CHECK REFUND
    const [[refund]] = await db.query(
      "SELECT * FROM refunds WHERE booking_id=? AND user_id=?",
      [bookingId, userId]
    );

    if (!refund) {
      return res.status(404).json({ message: "Refund not found" });
    }

    // ❌ ONLY IF APPROVED
    if (refund.status !== "approved") {
      return res.status(400).json({
        message: "Refund not approved yet"
      });
    }

    // ✅ UPDATE → REJECTED
    await db.query(
      `UPDATE refunds 
       SET user_approval='rejected', status='pending'
       WHERE booking_id=? AND user_id=?`,
      [bookingId, userId]
    );

    res.json({
      success: true,
      message: "Refund rejected. Owner will review again"
    });

  } catch (err) {
    console.error("❌ REJECT REFUND ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};