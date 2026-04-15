const db = require("../db");


const { decrypt } = require("../utils/encryption"); // ✅ ADD THIS AT TOP
/* ======================================================
   🧠 GET OWNER FROM FIREBASE UID
====================================================== */
const getOwner = async (firebase_uid) => {
  const [rows] = await db.query(
    `SELECT id, name, owner_verification_status
     FROM users 
     WHERE firebase_uid = ? AND role = 'owner'
     LIMIT 1`,
    [firebase_uid]
  );

  return rows[0] || null;
};

/* ======================================================
   📥 OWNER → GET BOOKINGS
====================================================== */
exports.getOwnerBookings = async (req, res) => {
  try {
    const owner = await getOwner(req.user.firebase_uid);

    if (!owner) {
      return res.status(403).json({ message: "Not an owner" });
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
    // 📥 STEP 2: FETCH BOOKINGS (ONLY VALID ONES)
    //////////////////////////////////////////////////////
    const [rows] = await db.query(
      `
      SELECT 
          b.id,
          b.pg_id,
          b.check_in_date,
          b.room_type,
          b.status,
          b.created_at,

          p.pg_name,

          /* ✅ SNAPSHOT TENANT NAME */
          b.name AS tenant_name,

          /* 🔒 SHOW PHONE ONLY AFTER APPROVAL */
          CASE 
            WHEN b.status IN ('approved','confirmed') 
            THEN b.phone
            ELSE NULL
          END AS tenant_phone

      FROM bookings b

      /* ✅ ONLY LATEST BOOKING PER USER */
      JOIN (
          SELECT MAX(id) id
          FROM bookings
          WHERE owner_id = ?
          GROUP BY pg_id, user_id
      ) latest ON latest.id = b.id

      JOIN pgs p ON p.id = b.pg_id

      /* 🔥 FILTER EXPIRED + OLD PENDING */
      WHERE b.owner_id = ?
      AND (
        b.status != 'pending'
        OR b.created_at >= NOW() - INTERVAL 24 HOUR
      )

      ORDER BY b.created_at DESC
      `,
      [owner.id, owner.id]
    );

    res.json(rows);

  } catch (err) {
    console.error("❌ GET OWNER BOOKINGS:", err);
    res.status(500).json({ message: "Server error" });
  }
};


/* ======================================================
   ✅ OWNER → APPROVE / REJECT BOOKING (FINAL VERSION)
====================================================== */
exports.updateBookingStatus = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { bookingId } = req.params;
    const { status, reject_reason } = req.body;

    const owner = await getOwner(req.user.firebase_uid);
    if (!owner) throw new Error("Not an owner");

    //////////////////////////////////////////////////////
    // ✅ VALID STATUS CHECK
    //////////////////////////////////////////////////////
    const allowedStatus = ["approved", "rejected"];

    if (!allowedStatus.includes(status)) {
      throw new Error("Invalid status");
    }

    //////////////////////////////////////////////////////
    // 🔒 GET BOOKING
    //////////////////////////////////////////////////////
    const [[booking]] = await connection.query(
      `SELECT * FROM bookings WHERE id = ? AND owner_id = ?`,
      [bookingId, owner.id]
    );

    if (!booking) throw new Error("Booking not found");

    //////////////////////////////////////////////////////
    // ❌ BLOCK EXPIRED BOOKING (VERY IMPORTANT)
    //////////////////////////////////////////////////////
    if (booking.status === "expired") {
      throw new Error("Cannot approve expired booking");
    }

    //////////////////////////////////////////////////////
    // ❌ BLOCK ALREADY PROCESSED
    //////////////////////////////////////////////////////
    if (["approved", "rejected", "cancelled"].includes(booking.status)) {
      throw new Error(`Booking already ${booking.status}`);
    }

    //////////////////////////////////////////////////////
    // 🚨 OWNER VERIFICATION CHECK
    //////////////////////////////////////////////////////
    if (status === "approved" && owner.owner_verification_status !== "verified") {
      throw new Error("Complete verification before approving booking");
    }

    //////////////////////////////////////////////////////
    // 🧠 AUTO EXPIRE CHECK (SAFETY)
    //////////////////////////////////////////////////////
    const createdAt = new Date(booking.created_at);
    const now = new Date();
    const diffHours = (now - createdAt) / (1000 * 60 * 60);

    if (booking.status === "pending" && diffHours > 24) {
      await connection.query(
        `UPDATE bookings SET status='expired' WHERE id=?`,
        [bookingId]
      );

      throw new Error("Booking expired automatically");
    }

    //////////////////////////////////////////////////////
    // ✅ UPDATE STATUS
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE bookings
       SET status = ?, reject_reason = ?
       WHERE id = ?`,
      [status, reject_reason || null, bookingId]
    );

    await connection.commit();

    res.json({
      success: true,
      message: `Booking ${status} successfully`
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ UPDATE BOOKING:", err);

    res.status(400).json({
      success: false,
      message: err.message
    });

  } finally {
    connection.release();
  }
};

/* ======================================================
   👥 OWNER → ACTIVE TENANTS
====================================================== */
exports.getActiveTenantsByOwner = async (req, res) => {
  try {
    const owner = await getOwner(req.user.firebase_uid);
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




exports.approveVacateRequest = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { bookingId } = req.params;
    const { damage_amount = 0, pending_dues = 0 } = req.body;

   
    const owner = await getOwner(req.user.firebase_uid);
    if (!owner) throw new Error("Not an owner");

    
    const [[booking]] = await connection.query(
      "SELECT * FROM bookings WHERE id=? AND owner_id=?",
      [bookingId, owner.id]
    );

    if (!booking) throw new Error("Booking not found");

    
    const [[refund]] = await connection.query(
      "SELECT * FROM refunds WHERE booking_id=? AND refund_type='DEPOSIT'",
      [bookingId]
    );

    if (!refund) throw new Error("Vacate request not found");

    
    const deposit = Number(booking.security_deposit) || 0;
    let refundAmount = deposit - damage_amount - pending_dues;
    if (refundAmount < 0) refundAmount = 0;

   
    let newStatus = "approved";
    let newUserApproval = "pending";

    // ✅ If user rejected earlier → allow re-approval
    if (refund.user_approval === "rejected") {
      newStatus = "approved";
      newUserApproval = "pending"; // reset again
    }

    // ✅ If already accepted → don't allow re-approve
    if (refund.user_approval === "accepted") {
      throw new Error("User already accepted. Cannot re-approve.");
    }

    //////////////////////////////////////////////////////
    // ✅ UPDATE REFUND
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE refunds 
       SET 
         amount=?, 
         status=?, 
         user_approval=?,
         damage_amount=?,
         reason = CONCAT('Vacate deposit refund | Damage: ₹', ?, ' | Dues: ₹', ?)
       WHERE booking_id=?`,
      [
        refundAmount,
        newStatus,
        newUserApproval,
        damage_amount,
        damage_amount,
        pending_dues,
        bookingId
      ]
    );

    //////////////////////////////////////////////////////
    // ❗ DO NOT MARK LEFT HERE (IMPORTANT FIX)
    //////////////////////////////////////////////////////
    // ❌ REMOVE THIS BLOCK (was causing issue)
    /*
    UPDATE pg_users SET status='LEFT'
    */

    //////////////////////////////////////////////////////
    // ✅ COMMIT
    //////////////////////////////////////////////////////
    await connection.commit();

    res.json({
      success: true,
      message: "Vacate approved successfully",
      refundAmount
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ VACATE APPROVE ERROR:", err);
    res.status(500).json({ message: err.message });
  } finally {
    connection.release();
  }
};




// ✅ MASK FUNCTIONS (ADD ABOVE OR BELOW)
function maskAccount(acc) {
  if (!acc) return "";
  return "XXXXXX" + acc.slice(-4);
}

function maskIFSC(ifsc) {
  if (!ifsc) return "";
  return ifsc.slice(0, 4) + "****";
}

function maskUPI(upi) {
  if (!upi) return "";
  const parts = upi.split("@");
  if (parts.length !== 2) return "****";
  return parts[0].slice(0, 2) + "***@" + parts[1];
}

exports.getVacateRequests = async (req, res) => {
  try {
    const owner = await getOwner(req.user.firebase_uid);

    if (!owner) {
      return res.status(403).json({ message: "Not an owner" });
    }

    const [rows] = await db.query(
      `
      SELECT 
        b.id AS booking_id,
        r.id AS id, 
        p.pg_name,
        u.name AS user_name,

        pu.move_out_date,

        b.security_deposit,

        r.amount AS refund_amount,
        r.status AS refund_status,
        r.user_approval,

        r.reason,
        r.upi_id,
        r.account_number,
        r.ifsc_code,
        r.damage_amount,

        r.created_at

      FROM refunds r
      JOIN bookings b ON b.id = r.booking_id
      JOIN users u ON u.id = b.user_id
      JOIN pgs p ON p.id = b.pg_id
      LEFT JOIN pg_users pu 
        ON pu.user_id = b.user_id 
        AND pu.pg_id = b.pg_id

      WHERE b.owner_id = ?
      AND r.refund_type = 'DEPOSIT'

      ORDER BY r.created_at DESC
      `,
      [owner.id]
    );

    //////////////////////////////////////////////////////
    // 🔐 DECRYPT + SMART MASKING
    //////////////////////////////////////////////////////
    rows.forEach(r => {
      let acc = null;
      let ifsc = null;
      let upi = null;

      try {
        acc = r.account_number ? decrypt(r.account_number) : null;
        ifsc = r.ifsc_code ? decrypt(r.ifsc_code) : null;
        upi = r.upi_id ? decrypt(r.upi_id) : null;
      } catch {
        acc = r.account_number;
        ifsc = r.ifsc_code;
        upi = r.upi_id;
      }

      //////////////////////////////////////////////////////
      // 🎯 FINAL LOGIC
      //////////////////////////////////////////////////////

      // ✅ ONLY when owner approved → show FULL
      if (r.refund_status === "approved") {
        r.account_number = acc;
        r.ifsc_code = ifsc;
        r.upi_id = upi;
      }

      // 🔒 ALL OTHER STATES → MASKED (including completed)
      else {
        r.account_number = maskAccount(acc);
        r.ifsc_code = maskIFSC(ifsc);
        r.upi_id = maskUPI(upi);
      }
    });

    res.json(rows);

  } catch (err) {
    console.error("❌ VACATE FETCH ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};


exports.rejectVacateRequest = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const owner = await getOwner(req.user.firebase_uid);
    if (!owner) return res.status(403).json({ message: "Not owner" });

    const [[refund]] = await db.query(
      `SELECT r.*, b.owner_id 
       FROM refunds r
       JOIN bookings b ON b.id = r.booking_id
       WHERE r.booking_id=?`,
      [bookingId]
    );

    if (!refund) {
      return res.status(404).json({ message: "Refund not found" });
    }

    if (refund.owner_id !== owner.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await db.query(
      `UPDATE refunds 
       SET status='rejected'
       WHERE booking_id=?`,
      [bookingId]
    );

    res.json({ success: true, message: "Refund rejected by owner" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};



exports.markRefundPaid = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    //////////////////////////////////////////////////////
    // 🔐 OWNER VALIDATION
    //////////////////////////////////////////////////////
    const owner = await getOwner(req.user.firebase_uid);
    if (!owner) throw new Error("Not an owner");

    //////////////////////////////////////////////////////
    // 📦 GET REFUND + BOOKING
    //////////////////////////////////////////////////////
    const [[refund]] = await connection.query(
      `SELECT r.*, b.owner_id, b.user_id, b.pg_id
       FROM refunds r
       JOIN bookings b ON b.id = r.booking_id
       WHERE r.id=?`,
      [id]
    );

    if (!refund) throw new Error("Refund not found");

    //////////////////////////////////////////////////////
    // 🔒 SECURITY CHECK
    //////////////////////////////////////////////////////
    if (refund.owner_id !== owner.id) {
      throw new Error("Unauthorized");
    }

    const bookingId = refund.booking_id;

    //////////////////////////////////////////////////////
    // ✅ VALIDATION
    //////////////////////////////////////////////////////
    const userApproval = (refund.user_approval || "").toLowerCase();
    const status = (refund.status || "").toLowerCase();

    if (userApproval !== "accepted") {
      throw new Error("User has not accepted refund yet");
    }

    //////////////////////////////////////////////////////
    // ✅ ALREADY COMPLETED FIX
    //////////////////////////////////////////////////////
    if (status === "completed") {
      await connection.commit();

      return res.json({
        success: true,
        message: "Already paid",
        status: "completed"
      });
    }

    if (!["pending", "approved"].includes(status)) {
      throw new Error("Invalid refund state");
    }

    //////////////////////////////////////////////////////
    // 💰 UPDATE REFUND
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE refunds 
       SET status='completed',
           updated_at = NOW()
       WHERE id=?`,
      [id]
    );

    //////////////////////////////////////////////////////
    // 🏠 UPDATE PG_USERS
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE pg_users 
       SET status='LEFT',
           vacate_status='completed'
       WHERE booking_id=?`,
      [bookingId]
    );

    //////////////////////////////////////////////////////
    // 📦 UPDATE BOOKINGS
    //////////////////////////////////////////////////////
    await connection.query(
      `UPDATE bookings 
       SET status='left'
       WHERE id=?`,
      [bookingId]
    );

    //////////////////////////////////////////////////////
    // ✅ COMMIT
    //////////////////////////////////////////////////////
    await connection.commit();

    //////////////////////////////////////////////////////
    // 🔥 IMPORTANT RESPONSE (FRONTEND FIX)
    //////////////////////////////////////////////////////
    res.json({
      success: true,
      message: "Refund completed successfully",
      status: "completed",   // ✅ VERY IMPORTANT
      booking_id: bookingId
    });

  } catch (err) {
    await connection.rollback();

    console.error("❌ MARK COMPLETED ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });

  } finally {
    connection.release();
  }
};

exports.getOwnerActiveTenants = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const [rows] = await db.query(`
      SELECT 
        pu.id AS pg_user_id,
        pu.status,

        u.id AS user_id,
        u.name,
        u.phone,
        u.email,

        p.id AS pg_id,
        p.pg_name,

        pr.room_no,

        b.id AS booking_id,
        b.order_id,
        b.room_type,
        b.food_preference,

        b.rent_amount,
        b.security_deposit,
        b.maintenance_amount,
        b.owner_amount,


        COALESCE(b.maintenance_amount, 0) AS maintenance_amount,


        pc.checkin_time,   -- ✅🔥 REAL CHECK-IN TIME

        b.status AS booking_status,

        b.created_at

      FROM pg_users pu

      JOIN users u ON u.id = pu.user_id
      JOIN pgs p ON p.id = pu.pg_id

      LEFT JOIN bookings b 
        ON b.id = pu.booking_id

      LEFT JOIN pg_rooms pr 
        ON pr.id = pu.room_id

      LEFT JOIN pg_checkins pc   -- ✅ NEW JOIN
        ON pc.booking_id = pu.booking_id

      WHERE pu.owner_id = ? 
      AND pu.status = 'ACTIVE'

      ORDER BY pc.checkin_time DESC
    `, [ownerId]);

    res.json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (err) {
    console.error("ACTIVE TENANTS ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};