const db = require("../db");

//////////////////////////////////////////////////////
// 🧑 CREATE BOOKING → PRODUCTION SAFE
//////////////////////////////////////////////////////
exports.createBooking = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { name, check_in_date, room_type, phone } = req.body;
    const userId = req.user.id;

    if (!check_in_date || !room_type) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // 🔐 PREVENT DOUBLE CLICK (CHECK FIRST)
    const [[existing]] = await db.query(
      `SELECT id FROM bookings
       WHERE user_id=? AND pg_id=? AND check_in_date=? LIMIT 1`,
      [userId, pgId, check_in_date]
    );

    if (existing) {
      return res.status(400).json({
        message: "Your booking is already submitted"
      });
    }

    // 👤 USER
    const [[user]] = await db.query(
      "SELECT name, email, phone FROM users WHERE id=?",
      [userId]
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    // 🏠 PG
    const [[pg]] = await db.query("SELECT * FROM pgs WHERE id=?", [pgId]);

    if (!pg) return res.status(404).json({ message: "PG not found" });

    //////////////////////////////////////////////////////
    // 💰 RENT CALCULATION
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
      if (room_type === "Single Room")
        rent = pg.co_living_single_room || 0;

      if (
        room_type === "Double Room" ||
        room_type === "Co-Living Double Room"
      )
        rent = pg.co_living_double_room || 0;
    }

    if (pg.pg_category === "to_let") {
      if (room_type === "1BHK") rent = pg.price_1bhk || 0;
      if (room_type === "2BHK") rent = pg.price_2bhk || 0;
      if (room_type === "3BHK") rent = pg.price_3bhk || 0;
      if (room_type === "4BHK") rent = pg.price_4bhk || 0;
    }

    const deposit = pg.deposit_amount || pg.security_deposit || 0;
    const maintenance = pg.maintenance_amount || 0;

    const finalName = name?.trim() || user.name;
    const finalPhone = phone?.trim() || user.phone;

    //////////////////////////////////////////////////////
    // 📝 INSERT
    //////////////////////////////////////////////////////
    await db.query(
      `INSERT INTO bookings
      (pg_id, user_id, owner_id, name, email, phone,
       check_in_date, room_type,
       rent_amount, security_deposit, maintenance_amount, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending')`,
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

    res.json({ success: true });

  } catch (err) {

    // 🔥 UNIQUE CONSTRAINT PROTECTION
    if (err.code === "ER_DUP_ENTRY") {
  return res.status(200).json({
    alreadyBooked: true,
    message: "You have already sent a request for this property"
  });
}

    console.error("CREATE BOOKING ERROR:", err);
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
exports.markPaymentDone = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { room_id } = req.body;
    const userId = req.user.id;

    const [[booking]] = await db.query(
      "SELECT * FROM bookings WHERE id=? AND user_id=?",
      [bookingId, userId]
    );

    if (!booking)
      return res.status(404).json({ message: "Booking not found" });

    await db.query(
      "UPDATE bookings SET status='confirmed', room_id=? WHERE id=?",
      [room_id || null, bookingId]
    );

    if (room_id) {
      await db.query(
        "UPDATE pg_rooms SET occupied_seats = occupied_seats + 1 WHERE id=?",
        [room_id]
      );
    }

    // 🔥 Added join_date (booking.check_in_date) to fix "Field join_date doesn't have a default value"
    await db.query(
      `INSERT INTO pg_users (pg_id, room_id, user_id, owner_id, status, join_date)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?)
       ON DUPLICATE KEY UPDATE status='ACTIVE', join_date=VALUES(join_date)`,
      [
        booking.pg_id,
        room_id || null,
        booking.user_id,
        booking.owner_id,
        booking.check_in_date 
      ]
    );

    res.json({ success: true });

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
        p.pg_name,
        pr.room_no,
        b.room_type,
        b.check_in_date AS join_date,
        -- ✅ Fetching the actual submission date from payments table
        pay.submitted_at AS paid_date,           
        DATE_ADD(b.check_in_date, INTERVAL 1 MONTH) AS next_due_date, 
        b.rent_amount,
        b.security_deposit AS deposit_amount,
        b.maintenance_amount,
        (b.rent_amount + b.maintenance_amount) AS monthly_total,
        b.status,
        pay.order_id                           -- Added for the receipt
      FROM bookings b
      JOIN pgs p ON p.id = b.pg_id
      LEFT JOIN pg_rooms pr ON pr.id = b.room_id
      -- ✅ Joining with payments table to get user paid date
      LEFT JOIN (
          SELECT booking_id, submitted_at, order_id 
          FROM payments 
          WHERE status = 'paid' 
          ORDER BY submitted_at DESC LIMIT 1
      ) pay ON pay.booking_id = b.id
      WHERE b.user_id = ? AND b.status = 'confirmed'
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
        (b.rent_amount + b.maintenance_amount) AS amount_paid,
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