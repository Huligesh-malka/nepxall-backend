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
    // 🔥 STEP 1: AUTO EXPIRE OLD BOOKINGS (24 HOURS)
    //////////////////////////////////////////////////////
    await db.query(`
      UPDATE bookings
      SET status = 'expired'
      WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL 24 HOUR
    `);

    //////////////////////////////////////////////////////
    // 🔐 STEP 2: PREVENT MULTIPLE BOOKINGS (STRONG CHECK)
    //////////////////////////////////////////////////////
    const [[existing]] = await db.query(
      `
      SELECT id FROM bookings 
      WHERE user_id = ?
      AND pg_id = ?
      AND status IN ('pending','approved')
      AND created_at >= NOW() - INTERVAL 24 HOUR
      LIMIT 1
      `,
      [userId, pgId]
    );

    if (existing) {
      return res.status(400).json({
        message: "You already requested this PG. Try again after 24 hours or wait for owner response."
      });
    }

    //////////////////////////////////////////////////////
    // 👤 STEP 3: USER DETAILS
    //////////////////////////////////////////////////////
    const [[user]] = await db.query(
      "SELECT id, name, email, phone FROM users WHERE id=?",
      [userId]
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    //////////////////////////////////////////////////////
    // 🏠 STEP 4: PG DETAILS
    //////////////////////////////////////////////////////
    const [[pg]] = await db.query(
      "SELECT * FROM pgs WHERE id=?",
      [pgId]
    );

    if (!pg) {
      return res.status(404).json({ message: "PG not found" });
    }

    //////////////////////////////////////////////////////
    // 💰 STEP 5: RENT CALCULATION
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

    if (pg.pg_category === "coliving") {
      if (room_type === "Single Room") {
        rent = pg.co_living_single_room || 0;
      }

      if (
        room_type === "Double Room" ||
        room_type === "Co-Living Double Room"
      ) {
        rent = pg.co_living_double_room || 0;
      }
    }

    if (pg.pg_category === "to_let") {
      if (room_type === "1BHK") rent = pg.price_1bhk || 0;
      if (room_type === "2BHK") rent = pg.price_2bhk || 0;
      if (room_type === "3BHK") rent = pg.price_3bhk || 0;
      if (room_type === "4BHK") rent = pg.price_4bhk || 0;
    }

    const deposit = pg.deposit_amount || pg.security_deposit || 0;
    const maintenance = pg.maintenance_amount || 0;

    //////////////////////////////////////////////////////
    // 👤 STEP 6: FINAL USER DATA
    //////////////////////////////////////////////////////
    const finalName =
      user.name || user.email?.split("@")[0] || "User";

    const finalPhone = user.phone || "";

    //////////////////////////////////////////////////////
    // 📝 STEP 7: INSERT BOOKING
    //////////////////////////////////////////////////////
    await db.query(
      `
      INSERT INTO bookings 
      (pg_id, user_id, owner_id, name, email, phone,
       check_in_date, room_type, 
       rent_amount, security_deposit, maintenance_amount, status) 
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending')
      `,
      [
        pgId,
        userId,
        pg.owner_id,
        finalName,
        user.email,
        finalPhone,
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
      message: "Booking request sent successfully (valid for 24 hours)"
    });

  } catch (err) {
    console.error("CREATE BOOKING ERROR:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(200).json({
        alreadyBooked: true,
        message: "Duplicate request detected"
      });
    }

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
    const { room_id, order_id } = req.body; // 👈 Capture order_id from request body
    const userId = req.user.id;

    // 1. Verify the booking exists for this user
    const [[booking]] = await db.query(
      "SELECT * FROM bookings WHERE id=? AND user_id=?",
      [bookingId, userId]
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // 2. Update Booking: Set status to confirmed, assign room, and SAVE order_id
    await db.query(
      `UPDATE bookings 
       SET status='confirmed', 
           room_id=?, 
           order_id=? 
       WHERE id=?`,
      [room_id || null, order_id || booking.order_id, bookingId] 
      // Note: order_id || booking.order_id ensures we don't overwrite with null if it already exists
    );

    // 3. Update Room Occupancy
    if (room_id) {
      await db.query(
        "UPDATE pg_rooms SET occupied_seats = occupied_seats + 1 WHERE id=?",
        [room_id]
      );
    }

    // 4. Sync with pg_users table for Active Stay tracking
    await db.query(
      `INSERT INTO pg_users (pg_id, room_id, user_id, owner_id, status, join_date)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?)
       ON DUPLICATE KEY UPDATE 
          status='ACTIVE', 
          room_id=VALUES(room_id), 
          join_date=VALUES(join_date)`,
      [
        booking.pg_id,
        room_id || null,
        booking.user_id,
        booking.owner_id,
        booking.check_in_date 
      ]
    );

    res.json({ 
      success: true, 
      message: "Payment verified and order ID updated",
      orderId: order_id 
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
    const {
      bookingId,
      vacate_date,
      reason,
      account_number,
      ifsc_code,
      upi_id
    } = req.body;

    const userId = req.user.id;

    if (!bookingId || !vacate_date || !reason) {
      return res.status(400).json({
        message: "Booking ID, vacate date and reason are required"
      });
    }

    const [[booking]] = await db.query(
      "SELECT * FROM bookings WHERE id=? AND user_id=?",
      [bookingId, userId]
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const [[existing]] = await db.query(
      `SELECT * FROM refunds 
       WHERE booking_id=? AND refund_type='DEPOSIT'`,
      [bookingId]
    );

    if (existing) {
      return res.status(400).json({
        message: "Vacate already requested for this booking"
      });
    }

    // ✅ ONLY MARK LEAVING
    await db.query(
      `UPDATE pg_users 
       SET 
         status='LEAVING',
         vacate_status='requested',
         vacate_reason=?,
         vacate_request_date=NOW(),
         move_out_date=? 
       WHERE user_id=? 
       AND pg_id=? 
       AND status='ACTIVE'`,
      [reason, vacate_date, userId, booking.pg_id]
    );

    // ✅ CREATE REFUND
    await db.query(
      `INSERT INTO refunds 
      (booking_id, user_id, amount, reason, upi_id, account_number, ifsc_code, refund_type, status)
      VALUES (?,?,?,?,?,?,?,'DEPOSIT','pending')`,
      [
        bookingId,
        userId,
        0,
        "Vacate deposit refund",
        upi_id || null,
        account_number || null,
        ifsc_code || null
      ]
    );

    res.json({
      success: true,
      message: "Vacate request submitted successfully"
    });

  } catch (err) {
    console.error("❌ VACATE ERROR:", err);
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