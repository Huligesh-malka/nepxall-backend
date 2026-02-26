const db = require("../db");
const { generateAgreementPDF } = require("../services/agreementService");

/* ======================================================
   🧠 GET OWNER FROM FIREBASE UID
====================================================== */
const getOwner = async (firebaseUid) => {
  const [rows] = await db.query(
    `SELECT id, name, owner_verification_status
     FROM users 
     WHERE firebase_uid = ? AND role = 'owner'
     LIMIT 1`,
    [firebaseUid]
  );

  return rows[0] || null;
};

/* ======================================================
   📥 OWNER → GET BOOKINGS
====================================================== */
exports.getOwnerBookings = async (req, res) => {
  try {
    const owner = await getOwner(req.user.firebaseUid);
    if (!owner) return res.status(403).json({ message: "Not an owner" });

    const [rows] = await db.query(
      `SELECT 
          b.id,
          b.pg_id,
          b.check_in_date,
          b.room_type,
          b.status,
          b.phone,
          b.created_at,
          p.pg_name,
          u.name AS tenant_name
       FROM bookings b
       JOIN (
          SELECT MAX(id) id
          FROM bookings
          WHERE owner_id = ?
          GROUP BY pg_id, user_id, check_in_date, room_type
       ) latest ON latest.id = b.id
       JOIN pgs p ON p.id = b.pg_id
       JOIN users u ON u.id = b.user_id
       ORDER BY b.created_at DESC`,
      [owner.id]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ GET OWNER BOOKINGS:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   ✅ OWNER → APPROVE / REJECT BOOKING
====================================================== */
exports.updateBookingStatus = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { bookingId } = req.params;
    const { status, reject_reason, room_id, exit_date } = req.body;

    const owner = await getOwner(req.user.firebaseUid);
    if (!owner) throw new Error("Not an owner");

    /* 🚨 BLOCK IF NOT VERIFIED */
    if (status === "approved" && owner.owner_verification_status !== "verified") {
      await connection.rollback();
      return res.status(403).json({
        code: "ONBOARDING_PENDING",
        message: "Complete verification before approving booking"
      });
    }

    /* 🔒 VALIDATE BOOKING */
    const [[booking]] = await connection.query(
      `SELECT * FROM bookings WHERE id = ? AND owner_id = ?`,
      [bookingId, owner.id]
    );

    if (!booking) throw new Error("Not your booking");

    /* ✅ UPDATE BOOKING */
    await connection.query(
      `UPDATE bookings
       SET status = ?, reject_reason = ?
       WHERE id = ?`,
      [status, reject_reason || null, bookingId]
    );

    /* ======================================================
       🟢 IF APPROVED → ADD TO pg_users
    ====================================================== */
    if (status === "approved") {

      const [[existing]] = await connection.query(
        `SELECT id FROM pg_users
         WHERE user_id = ? AND pg_id = ? AND status = 'ACTIVE'`,
        [booking.user_id, booking.pg_id]
      );

      if (!existing) {
        await connection.query(
          `INSERT INTO pg_users
           (owner_id, pg_id, user_id, room_no, join_date, exit_date, status)
           VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
          [
            owner.id,
            booking.pg_id,
            booking.user_id,
            room_id || null,
            booking.check_in_date,
            exit_date || null
          ]
        );
      }

      
/* ======================================================
   👥 OWNER → ACTIVE TENANTS
====================================================== */
exports.getActiveTenantsByOwner = async (req, res) => {
  try {
    const owner = await getOwner(req.user.firebaseUid);
    if (!owner) return res.status(403).json({ message: "Not an owner" });

    const [rows] = await db.query(
      `SELECT
         pu.id,
         pu.join_date,
         pu.exit_date,
         u.name,
         u.phone,
         p.pg_name
       FROM pg_users pu
       JOIN users u ON u.id = pu.user_id
       JOIN pgs p ON p.id = pu.pg_id
       WHERE pu.owner_id = ? AND pu.status = 'ACTIVE'`,
      [owner.id]
    );

    res.json(rows);

  } catch (err) {
    console.error("❌ ACTIVE TENANTS:", err);
    res.status(500).json({ message: "Server error" });
  }
};