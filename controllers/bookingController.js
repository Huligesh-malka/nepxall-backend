const db = require("../db");
const { encrypt } = require("../utils/encryption");

//////////////////////////////////////////////////////
// 🧑 CREATE BOOKING → PRODUCTION SAFE (FINAL FIX)
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
    // 🔐 STEP 2: BLOCK ANY ACTIVE BOOKING
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
    // 💰 RENT CALCULATION (🔥 FINAL FIX)
    //////////////////////////////////////////////////////
    let rent = 0;

    // normalize room_type
    const normalized = room_type.toLowerCase().replace(/\s/g, "");

    //////////////////////////////////////////////////////
    // ✅ PG CATEGORY
    //////////////////////////////////////////////////////
    if (pg.pg_category === "pg") {
      if (normalized === "singlesharing") rent = pg.single_sharing || 0;
      else if (normalized === "doublesharing") rent = pg.double_sharing || 0;
      else if (normalized === "triplesharing") rent = pg.triple_sharing || 0;
      else if (normalized === "foursharing") rent = pg.four_sharing || 0;
      else if (normalized === "singleroom") rent = pg.single_room || 0;
      else if (normalized === "doubleroom") rent = pg.double_room || 0;
    }

    //////////////////////////////////////////////////////
    // 🔥 COLIVING CATEGORY (YOUR FIX)
    //////////////////////////////////////////////////////
    if (pg.pg_category === "coliving") {
      if (normalized === "singleroom") rent = pg.co_living_single_room || 0;
      else if (normalized === "doubleroom") rent = pg.co_living_double_room || 0;
    }

    //////////////////////////////////////////////////////
    // ✅ TO-LET CATEGORY
    //////////////////////////////////////////////////////
    if (pg.pg_category === "to_let") {
      const type = room_type.toUpperCase().replace(/\s/g, "");

      if (type === "1BHK") rent = pg.price_1bhk || 0;
      else if (type === "2BHK") rent = pg.price_2bhk || 0;
      else if (type === "3BHK") rent = pg.price_3bhk || 0;
      else if (type === "4BHK") rent = pg.price_4bhk || 0;
    }

    //////////////////////////////////////////////////////
    // ❗ VALIDATION
    //////////////////////////////////////////////////////
    if (!rent || rent === 0) {
      return res.status(400).json({
        message: "Invalid room type or rent not configured"
      });
    }

    //////////////////////////////////////////////////////
    // 💰 OTHER CHARGES
    //////////////////////////////////////////////////////
    const deposit = pg.deposit_amount || 0;
    const maintenance = pg.maintenance_amount || 0;

    //////////////////////////////////////////////////////
    // 📝 INSERT BOOKING
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
    // ✅ SUCCESS
    //////////////////////////////////////////////////////
    res.json({
      success: true,
      bookingId: result.insertId,
      rent,
      deposit,
      maintenance,
      message: "Booking created successfully"
    });

  } catch (err) {
    console.error("❌ CREATE BOOKING ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

exports.getUserBookings = async (req, res) => {
  try {
    const includeAgreement = req.query.agreement === "true";

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
        b.agreement_signed,
        b.created_at,

        p.pg_name,
        p.location,              -- ✅ USE THIS (FULL LOCATION)
        p.area,
        p.city,
        p.contact_phone,         -- ✅ DIRECT PHONE

        pr.room_no

      FROM bookings b
      JOIN pgs p ON p.id = b.pg_id
      LEFT JOIN pg_rooms pr ON pr.id = b.room_id
      WHERE b.user_id=?
      ORDER BY b.created_at DESC
      `,
      [req.user.id]
    );

    const updated = rows.map((item) => {
      // 💰 TOTAL
      let total =
        Number(item.rent_amount || 0) +
        Number(item.security_deposit || 0) +
        Number(item.maintenance_amount || 0);

      if (includeAgreement) {
        total += 500;
      }

      // 📍 LOCATION PRIORITY
      const finalLocation =
        item.location ||
        `${item.area || ""}, ${item.city || ""}`.trim() ||
        null;

      // 🔐 SHOW ONLY AFTER APPROVAL
      const showDetails =
        item.status === "approved" || item.status === "confirmed";

      return {
        id: item.id,
        pg_id: item.pg_id,
        pg_name: item.pg_name,

        // ✅ LOCATION
        location: showDetails ? finalLocation : null,

        // ✅ PHONE
        phone: showDetails ? item.contact_phone : null,

        // ✅ ROOM
        room_no: item.room_no,
        room_type: item.room_type,
        check_in_date: item.check_in_date,

        // ✅ STATUS
        status: item.status,

        // ✅ PRICE
        rent_amount: item.rent_amount,
        security_deposit: item.security_deposit,
        maintenance_amount: item.maintenance_amount,
        total_amount: total,

        // ✅ AGREEMENT
        agreement_signed: item.agreement_signed,
        agreement_added: includeAgreement,

        created_at: item.created_at,
      };
    });

    res.json(updated);
  } catch (err) {
    console.error("GET BOOKINGS ERROR:", err);
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

        /* ✅ NEW: CORRECT TOTAL PAID */
        (b.rent_amount + b.maintenance_amount + b.security_deposit) AS total_paid,

        /* ✅ FULL REFUND */
        (
          SELECT r1.status
          FROM refunds r1
          WHERE r1.booking_id = b.id
          AND r1.refund_type = 'FULL'
          ORDER BY r1.created_at DESC
          LIMIT 1
        ) AS full_refund_status,

        (
          SELECT r1.amount
          FROM refunds r1
          WHERE r1.booking_id = b.id
          AND r1.refund_type = 'FULL'
          ORDER BY r1.created_at DESC
          LIMIT 1
        ) AS full_refund_amount,

        /* ✅ DEPOSIT REFUND */
        (
          SELECT r2.status
          FROM refunds r2
          WHERE r2.booking_id = b.id
          AND r2.refund_type = 'DEPOSIT'
          ORDER BY r2.created_at DESC
          LIMIT 1
        ) AS deposit_refund_status,

        (
          SELECT r2.amount
          FROM refunds r2
          WHERE r2.booking_id = b.id
          AND r2.refund_type = 'DEPOSIT'
          ORDER BY r2.created_at DESC
          LIMIT 1
        ) AS deposit_refund_amount,

        /* 🔥 FIX: ADD THIS ONLY */
        (
          SELECT r2.user_approval
          FROM refunds r2
          WHERE r2.booking_id = b.id
          AND r2.refund_type = 'DEPOSIT'
          ORDER BY r2.created_at DESC
          LIMIT 1
        ) AS deposit_user_approval,

        /* JOIN STATUS */
        (SELECT COUNT(*) 
         FROM pg_checkins pc 
         WHERE pc.booking_id = b.id) AS is_joined,

        'ACTIVE' AS status

      FROM bookings b
      JOIN pgs pg ON pg.id = b.pg_id
      LEFT JOIN pg_rooms pr ON pr.id = b.room_id

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

    if (!booking) {
      throw new Error("Booking not found");
    }

    //////////////////////////////////////////////////////
    // ❌ BLOCK IF USER ALREADY JOINED
    //////////////////////////////////////////////////////
    const [[checkin]] = await connection.query(
      "SELECT id FROM pg_checkins WHERE booking_id=?",
      [bookingId]
    );

    if (checkin) {
      throw new Error("Already joined PG. Use vacate option.");
    }

    //////////////////////////////////////////////////////
    // ❌ BLOCK DUPLICATE REQUEST
    //////////////////////////////////////////////////////
    const [[existing]] = await connection.query(
      `SELECT * FROM refunds 
       WHERE booking_id=? 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [bookingId]
    );

    if (existing && existing.status !== "rejected") {
      throw new Error("Refund already requested");
    }

    //////////////////////////////////////////////////////
    // ✅ CALCULATE FULL REFUND AMOUNT
    //////////////////////////////////////////////////////
    const amount =
      (Number(booking.rent_amount) || 0) +
      (Number(booking.security_deposit) || 0) +
      (Number(booking.maintenance_amount) || 0);

    //////////////////////////////////////////////////////
    // ✅ INSERT FULL REFUND → PENDING
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
      message: "Refund request submitted successfully",
      status: "pending"
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ REFUND ERROR:", err);

    //////////////////////////////////////////////////////
    // 🔥 ONLY CHANGE HERE (IMPORTANT)
    //////////////////////////////////////////////////////
    res.status(400).json({
      message: err.message
    });

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

    if (!bookingId || !vacate_date || !reason) {
      return res.status(400).json({
        message: "Booking ID, vacate date and reason required"
      });
    }

    const [[booking]] = await db.query(
      "SELECT * FROM bookings WHERE id=? AND user_id=?",
      [bookingId, userId]
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const [[pgUser]] = await db.query(
      "SELECT * FROM pg_users WHERE booking_id=?",
      [bookingId]
    );

    if (!pgUser) {
      return res.status(404).json({ message: "PG user record not found" });
    }

    const [[lastRefund]] = await db.query(
      `SELECT status FROM refunds 
       WHERE booking_id=? 
       ORDER BY id DESC LIMIT 1`,
      [bookingId]
    );

    if (
      pgUser.vacate_status === "requested" &&
      lastRefund &&
      lastRefund.status !== "rejected"
    ) {
      return res.status(400).json({
        message: "Vacate already requested"
      });
    }

    if (pgUser.vacate_status === "completed") {
      return res.status(400).json({
        message: "Already vacated"
      });
    }

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

    let refundAmount = booking.security_deposit || 0;

    const [[existingRefund]] = await db.query(
      `SELECT * FROM refunds 
       WHERE booking_id=? AND refund_type='DEPOSIT'
       ORDER BY created_at DESC LIMIT 1`,
      [bookingId]
    );

    //////////////////////////////////////////////////////
    // 🔐 ENCRYPT DATA HERE
    //////////////////////////////////////////////////////
    const enc_upi = upi_id ? encrypt(upi_id) : null;
    const enc_account = account_number ? encrypt(account_number) : null;
    const enc_ifsc = ifsc_code ? encrypt(ifsc_code) : null;

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
          enc_upi,
          enc_account,
          enc_ifsc,
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
          enc_upi,
          enc_account,
          enc_ifsc
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

    // ✅ FIXED (DO NOT CHANGE STATUS)
    await db.query(
      `UPDATE refunds 
       SET user_approval='accepted'
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