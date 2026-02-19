const db = require("../db");
const { generateAgreementPDF } = require("../services/agreementService");

/* ======================================================
   🧠 GET OWNER MYSQL USER
====================================================== */
const getOwner = async (firebaseUid) => {
  const [rows] = await db.query(
    "SELECT id, name FROM users WHERE firebase_uid = ? AND role = 'owner'",
    [firebaseUid]
  );
  return rows[0] || null;
};

/* ======================================================
   📥 OWNER → GET BOOKINGS
====================================================== */
exports.getOwnerBookings = async (req, res) => {
  try {
    const owner = await getOwner(req.user.uid);

    if (!owner) {
      return res.status(403).json({ message: "Access denied. Owner account required." });
    }

    const [rows] = await db.query(
      `
      SELECT
        b.id,
        p.pg_name,
        COALESCE(u.name,'User') AS tenant_name,
        b.phone,
        b.check_in_date,
        b.room_type,
        b.status,
        b.created_at
      FROM bookings b
      JOIN pgs p ON p.id = b.pg_id
      JOIN users u ON u.id = b.user_id
      WHERE b.owner_id = ?
      ORDER BY b.created_at DESC
      `,
      [owner.id]
    );

    res.json(rows);

  } catch (err) {
    console.error("OWNER BOOKINGS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   ✅ OWNER → UPDATE BOOKING STATUS
====================================================== */
exports.updateBookingStatus = async (req, res) => {

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const bookingId = req.params.bookingId;
    const { status, reject_reason, room_id, exit_date } = req.body;

    const owner = await getOwner(req.user.uid);

    if (!owner) {
      return res.status(403).json({ message: "Access denied. Not an owner." });
    }

    /* 🔒 VALIDATE BOOKING */
    const [[bookingCheck]] = await connection.query(
      `
      SELECT b.*
      FROM bookings b
      JOIN pgs p ON p.id = b.pg_id
      WHERE b.id = ? AND p.owner_id = ?
      `,
      [bookingId, owner.id]
    );

    if (!bookingCheck) {
      return res.status(403).json({ message: "Not your booking" });
    }

    /* ✅ UPDATE BOOKING STATUS */
    await connection.query(
      `UPDATE bookings
       SET status = ?, reject_reason = ?
       WHERE id = ?`,
      [status, reject_reason || null, bookingId]
    );

    /* ======================================================
       🟢 IF APPROVED → INSERT INTO pg_users
    ====================================================== */
    if (status === "approved") {

      const [[existing]] = await connection.query(
        `SELECT id FROM pg_users
         WHERE user_id = ? AND pg_id = ? AND status = 'ACTIVE'`,
        [bookingCheck.user_id, bookingCheck.pg_id]
      );

      if (!existing) {

        await connection.query(
          `INSERT INTO pg_users
           (owner_id, pg_id, user_id, room_no, join_date, exit_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            owner.id,
            bookingCheck.pg_id,
            bookingCheck.user_id,
            room_id || null,
            bookingCheck.check_in_date,
            exit_date || null,
            "ACTIVE",
          ]
        );
      }

      /* ======================================================
         📄 GENERATE AGREEMENT
      ====================================================== */

      const [[agreementExists]] = await connection.query(
        "SELECT id FROM rent_agreements WHERE booking_id = ?",
        [bookingId]
      );

      if (!agreementExists) {

        const [[booking]] = await connection.query(`
          SELECT 
            b.*,
            u.name  AS user_name,
            u.phone AS user_phone,
            p.pg_name,
            p.address
          FROM bookings b
          JOIN users u ON u.id = b.user_id
          JOIN pgs p   ON p.id = b.pg_id
          WHERE b.id = ?
        `, [bookingId]);

        const [[docs]] = await connection.query(`
          SELECT digital_signature_file
          FROM owner_verifications
          WHERE owner_id = ? AND status = 'approved'
        `, [owner.id]);

        const pdf = await generateAgreementPDF({
          booking,
          owner,
          user: {
            name: booking.user_name,
            phone: booking.user_phone,
          },
          pg: {
            pg_name: booking.pg_name,
            address: booking.address,
          },
          ownerSignaturePath: docs?.digital_signature_file || null,
        });

        await connection.query(
          `INSERT INTO rent_agreements
           (booking_id, pg_id, owner_id, user_id,
            agreement_file, agreement_hash, owner_signature_file)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            bookingId,
            booking.pg_id,
            owner.id,
            booking.user_id,
            pdf.agreement_file,
            pdf.agreement_hash,
            docs?.digital_signature_file || null,
          ]
        );
      }
    }

    await connection.commit();

    res.json({
      success: true,
      message: "Booking updated successfully",
    });

  } catch (err) {

    await connection.rollback();

    console.error("UPDATE BOOKING ERROR:", err);
    res.status(500).json({ message: err.message });

  } finally {
    connection.release();
  }
};
