const db = require("../db");

/* ======================================================
   🔧 GET OR CREATE MYSQL USER
====================================================== */
async function getOrCreateUser(firebaseUser) {
  const { uid, name, email, phone_number } = firebaseUser;

  const [rows] = await db.query(
    "SELECT id, name FROM users WHERE firebase_uid=?",
    [uid]
  );

  if (rows.length) return rows[0];

  const [result] = await db.query(
    `INSERT INTO users (firebase_uid, name, email, phone, role)
     VALUES (?, ?, ?, ?, 'tenant')`,
    [uid, name || "User", email || null, phone_number || null]
  );

  return { id: result.insertId, name: name || "User" };
}

/* ======================================================
   👑 CHECK OWNER
====================================================== */
async function isOwner(userId) {
  const [rows] = await db.query(
    "SELECT id FROM pgs WHERE owner_id=? LIMIT 1",
    [userId]
  );
  return rows.length > 0;
}

/* ======================================================
   USER → CREATE BOOKING
====================================================== */
exports.createBooking = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { name, phone, check_in_date, room_type } = req.body;

    if (!pgId || !name || !phone || !check_in_date || !room_type) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const user = await getOrCreateUser(req.user);

    await db.query("UPDATE users SET name=? WHERE id=?", [
      name.trim(),
      user.id,
    ]);

    const [[pg]] = await db.query(
      "SELECT owner_id FROM pgs WHERE id=? AND is_deleted=0",
      [pgId]
    );

    if (!pg) return res.status(404).json({ message: "PG not found" });

    const [result] = await db.query(
      `INSERT INTO bookings
       (pg_id, user_id, owner_id, name, phone, check_in_date, room_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [pgId, user.id, pg.owner_id, name, phone, check_in_date, room_type]
    );

    res.status(201).json({ success: true, bookingId: result.insertId });

  } catch (err) {
    console.error("❌ createBooking:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   USER → BOOKING HISTORY
====================================================== */
exports.getUserBookings = async (req, res) => {
  try {
    const user = await getOrCreateUser(req.user);

    const [rows] = await db.query(
      `
      SELECT b.*, p.pg_name
      FROM bookings b
      JOIN pgs p ON p.id = b.pg_id
      WHERE b.user_id=?
      ORDER BY b.created_at DESC
      `,
      [user.id]
    );

    res.json(rows);

  } catch (err) {
    console.error("❌ getUserBookings:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   OWNER → GET BOOKINGS
====================================================== */
exports.getOwnerBookings = async (req, res) => {
  try {
    const owner = await getOrCreateUser(req.user);

    if (!(await isOwner(owner.id))) return res.json([]);

    const [rows] = await db.query(
      `
      SELECT
        b.id,
        p.pg_name,
        u.name AS tenant_name,
        b.phone,
        b.check_in_date,
        b.room_type,
        b.status,
        b.created_at
      FROM bookings b
      JOIN pgs p ON p.id = b.pg_id
      JOIN users u ON u.id = b.user_id
      WHERE b.owner_id=?
      ORDER BY b.created_at DESC
      `,
      [owner.id]
    );

    res.json(rows);

  } catch (err) {
    console.error("❌ getOwnerBookings:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   OWNER → UPDATE BOOKING STATUS
====================================================== */
exports.updateBookingStatus = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { bookingId } = req.params;
    const { status, reject_reason, room_no, exit_date } = req.body;

    const owner = await getOrCreateUser(req.user);

    if (!(await isOwner(owner.id))) {
      return res.status(403).json({ message: "Not an owner" });
    }

    const [[booking]] = await connection.query(
      `SELECT * FROM bookings WHERE id=? AND owner_id=?`,
      [bookingId, owner.id]
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    await connection.query(
      `UPDATE bookings SET status=?, reject_reason=? WHERE id=?`,
      [status, reject_reason || null, bookingId]
    );

    /* 🎉 MOVE TENANT TO pg_users */
    if (status === "approved") {
      const [[existing]] = await connection.query(
        `SELECT id FROM pg_users
         WHERE user_id=? AND pg_id=? AND status='ACTIVE'`,
        [booking.user_id, booking.pg_id]
      );

      if (!existing) {
        await connection.query(
          `INSERT INTO pg_users
           (owner_id, pg_id, user_id, room_no, join_date, exit_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            owner.id,
            booking.pg_id,
            booking.user_id,
            room_no || null,
            booking.check_in_date,
            exit_date || null,
            "ACTIVE",
          ]
        );
      }
    }

    await connection.commit();
    res.json({ success: true });

  } catch (err) {
    await connection.rollback();
    console.error("❌ updateBookingStatus:", err);
    res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};

/* ======================================================
   👥 OWNER → ACTIVE TENANTS
====================================================== */
exports.getActiveTenantsByOwner = async (req, res) => {
  try {
    const owner = await getOrCreateUser(req.user);

    if (!(await isOwner(owner.id))) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [rows] = await db.query(
      `
      SELECT
        pu.id,
        u.name,
        u.phone,
        pu.room_no,
        pu.join_date,
        pu.status,
        p.pg_name
      FROM pg_users pu
      JOIN users u ON u.id = pu.user_id
      JOIN pgs p ON p.id = pu.pg_id
      WHERE pu.owner_id = ?
      AND pu.status = 'ACTIVE'
      ORDER BY pu.join_date DESC
      `,
      [owner.id]
    );

    res.json(rows);

  } catch (err) {
    console.error("ACTIVE TENANTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   👤 USER → ACTIVE STAY
====================================================== */
exports.getMyActiveStay = async (req, res) => {
  try {
    const user = await getOrCreateUser(req.user);

    const [[row]] = await db.query(
      `
      SELECT
        pu.room_no,
        pu.join_date,
        pu.status,

        p.pg_name,
        p.rent_amount,
        p.maintenance_amount,
        p.deposit_amount,

        (p.rent_amount + p.maintenance_amount) AS monthly_total

      FROM pg_users pu
      JOIN pgs p ON p.id = pu.pg_id
      WHERE pu.user_id = ?
      AND pu.status = 'ACTIVE'
      LIMIT 1
      `,
      [user.id]
    );

    res.json(row || null);

  } catch (err) {
    console.error("ACTIVE STAY ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
