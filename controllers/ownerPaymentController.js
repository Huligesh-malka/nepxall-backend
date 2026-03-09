const db = require("../db");

////////////////////////////////////////////////////////////
// GET OWNER PAYMENTS - FIXED VERSION
////////////////////////////////////////////////////////////
exports.getOwnerPayments = async (req, res) => {
  try {
    const ownerId = req.user.id;
    console.log("🔍 Owner ID:", ownerId);

    // Simple query first
    const [pgs] = await db.query(
      "SELECT id, name as pg_name FROM pgs WHERE owner_id = ?",
      [ownerId]
    );
    
    console.log("🏠 PGs found:", pgs);

    // Simple bookings query
    const [bookings] = await db.query(`
      SELECT 
        b.id as booking_id,
        b.name as tenant_name,
        b.phone,
        b.owner_amount,
        b.status as booking_status,
        p.status as payment_status
      FROM bookings b
      LEFT JOIN payments p ON b.id = p.booking_id
      WHERE b.pg_id IN (SELECT id FROM pgs WHERE owner_id = ?)
    `, [ownerId]);

    console.log("📊 Bookings found:", bookings);

    res.json({
      success: true,
      data: bookings,
      debug: { ownerId, pgCount: pgs.length }
    });

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.message,
      stack: err.stack
    });
  }
};


exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const ownerId = req.user.id;  // FIXED: Use req.user.id

    console.log("📊 Fetching summary for owner:", ownerId);

    const [rows] = await db.query(`
      SELECT 
        COUNT(DISTINCT b.id) as total_bookings,
        COUNT(DISTINCT CASE WHEN p.status = 'paid' THEN b.id END) as verified_payments,
        COUNT(DISTINCT CASE WHEN p.status = 'submitted' THEN b.id END) as pending_approval,
        COUNT(DISTINCT CASE WHEN p.status = 'rejected' THEN b.id END) as rejected_payments,
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN b.owner_amount ELSE 0 END), 0) as total_earned,
        COALESCE(SUM(CASE WHEN b.owner_settlement = 'PENDING' AND p.status = 'paid' THEN b.owner_amount ELSE 0 END), 0) as pending_settlement,
        COALESCE(SUM(CASE WHEN b.owner_settlement = 'DONE' THEN b.owner_amount ELSE 0 END), 0) as completed_settlement
      FROM bookings b
      INNER JOIN pgs pg ON pg.id = b.pg_id
      LEFT JOIN payments p ON b.id = p.booking_id
      WHERE pg.owner_id = ?
    `, [ownerId]);

    res.json({
      success: true,
      data: rows[0] || {
        total_bookings: 0,
        verified_payments: 0,
        pending_approval: 0,
        rejected_payments: 0,
        total_earned: 0,
        pending_settlement: 0,
        completed_settlement: 0
      }
    });

  } catch (err) {
    console.error("❌ SUMMARY ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load summary",
      error: err.message
    });
  }
};