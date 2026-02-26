const db = require("../db");

//////////////////////////////////////////////////////
// ✅ SAVE USER CONSENT (AADHAAR + AGREEMENT)
//////////////////////////////////////////////////////
exports.saveUserConsent = async (req, res) => {
  try {
    const { bookingId, aadhaarConsent, agreementConsent } = req.body;
    const userId = req.user.mysqlId;

    if (!aadhaarConsent || !agreementConsent) {
      return res.status(400).json({
        error: "All consents are required"
      });
    }

    await db.query(
      `UPDATE bookings 
       SET kyc_verified = 1,
           agreement_signed = 1
       WHERE id = ? AND user_id = ?`,
      [bookingId, userId]
    );

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

//////////////////////////////////////////////////////
// 🏠 COMPLETE MOVE-IN (ACTIVATE STAY)
//////////////////////////////////////////////////////
exports.completeMoveIn = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const userId = req.user.mysqlId;

    const [[booking]] = await db.query(
      `SELECT * FROM bookings 
       WHERE id=? AND user_id=? AND status='confirmed'`,
      [bookingId, userId]
    );

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (!booking.kyc_verified || !booking.agreement_signed) {
      return res.status(400).json({
        error: "Complete KYC & Agreement first"
      });
    }

    //////////////////////////////////////////////////
    // ✅ ACTIVATE STAY
    //////////////////////////////////////////////////
    await db.query(
      `INSERT INTO pg_users 
       (pg_id, user_id, owner_id, status)
       VALUES (?, ?, ?, 'ACTIVE')`,
      [booking.pg_id, userId, booking.owner_id]
    );

    await db.query(
      `UPDATE bookings 
       SET move_in_completed = 1 
       WHERE id=?`,
      [bookingId]
    );

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

//////////////////////////////////////////////////////
// 📊 GET MOVE-IN STATUS
//////////////////////////////////////////////////////
exports.getMoveInStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const [[row]] = await db.query(
      `SELECT kyc_verified, agreement_signed, move_in_completed
       FROM bookings WHERE id=?`,
      [bookingId]
    );

    res.json(row);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};