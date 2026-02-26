const db = require("../db");
const { generateAgreementPDF } = require("../services/agreementService");

/* ======================================================
   🧠 GET OWNER FROM FIREBASE UID
====================================================== */
const getOwner = async (firebaseUid) => {
  const [rows] = await db.query(
    `SELECT id, name, owner_onboarding_completed
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
      `SELECT *
       FROM (
         SELECT
           b.id,
           b.pg_id,
           b.check_in_date,
           b.room_type,
           b.status,
           b.phone,
           b.created_at,
           p.pg_name,
           u.name AS tenant_name,
           ROW_NUMBER() OVER (
             PARTITION BY b.pg_id, b.user_id, b.check_in_date, b.room_type
             ORDER BY b.id DESC
           ) AS rn
         FROM bookings b
         JOIN pgs p ON p.id = b.pg_id
         JOIN users u ON u.id = b.user_id
         WHERE b.owner_id = ?
       ) x
       WHERE rn = 1
       ORDER BY created_at DESC`,
      [owner.id]
    );

    res.json(rows);

  } catch (err) {
    console.error(err);
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

    /* 🚨 BLOCK IF ONBOARDING NOT COMPLETE */
    if (status === "approved" && owner.owner_onboarding_completed !== 1) {
      await connection.rollback();
      return res.status(403).json({
        code: "ONBOARDING_PENDING",
        message: "Complete verification before approving booking"
      });
    }

    /* 🔒 VALIDATE BOOKING */
    const [[booking]] = await connection.query(
      `SELECT * FROM bookings
       WHERE id = ? AND owner_id = ?`,
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
         📄 AUTO CREATE AGREEMENT
      ====================================================== */

      const [[agreementExists]] = await connection.query(
        `SELECT id FROM rent_agreements WHERE booking_id = ?`,
        [bookingId]
      );

      if (!agreementExists) {

        const [[fullBooking]] = await connection.query(
          `SELECT 
             b.*,
             u.name AS user_name,
             u.phone AS user_phone,
             p.pg_name,
             p.address
           FROM bookings b
           JOIN users u ON u.id = b.user_id
           JOIN pgs p ON p.id = b.pg_id
           WHERE b.id = ?`,
          [bookingId]
        );

        const pdf = await generateAgreementPDF({
          booking: fullBooking,
          owner,
          user: {
            name: fullBooking.user_name,
            phone: fullBooking.user_phone,
          },
          pg: {
            pg_name: fullBooking.pg_name,
            address: fullBooking.address,
          },
          ownerSignaturePath: null, // 🔥 no Aadhaar verification dependency
        });

        await connection.query(
          `INSERT INTO rent_agreements
           (booking_id, pg_id, owner_id, user_id,
            agreement_file, agreement_hash)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            bookingId,
            fullBooking.pg_id,
            owner.id,
            fullBooking.user_id,
            pdf.agreement_file,
            pdf.agreement_hash
          ]
        );
      }
    }

    await connection.commit();

    res.json({ success: true });

  } catch (err) {
    await connection.rollback();
    console.error("❌ UPDATE BOOKING:", err);
    res.status(500).json({ message: err.message });
  } finally {
    connection.release();
  }
};

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
    res.status(500).json({ message: "Server error" });
  }
};