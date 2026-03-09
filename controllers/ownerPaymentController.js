const db = require("../db");

exports.getOwnerPayments = async (req, res) => {
  try {
    // IMPORTANT: Use mysqlId from auth middleware, not id
    const ownerId = req.user.mysqlId || req.user.id;
    
    console.log("🔍 Fetching payments for owner ID:", ownerId);

    // Fixed SQL query - removed the stray 'a'
    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.name AS tenant_name,
        b.phone,
        b.owner_amount,
        b.owner_settlement,
        b.settlement_date,
        b.status AS booking_status,  /* Fixed: removed the 'a' */
        pg.pg_name,
        p.status AS payment_status,
        p.order_id,
        p.amount AS payment_amount,
        p.created_at AS payment_date,
        p.utr
      FROM bookings b
      JOIN pgs pg ON pg.id = b.pg_id
      LEFT JOIN payments p ON b.id = p.booking_id
      WHERE b.owner_id = ? 
      AND b.status IN ('confirmed', 'approved', 'agreement_ready')
      ORDER BY b.created_at DESC
    `, [ownerId]);

    console.log(`📊 Found ${rows.length} records for owner ${ownerId}`);

    res.json({
      success: true,
      data: rows,
      count: rows.length
    });

  } catch (err) {
    console.error("❌ OWNER PAYMENTS ERROR:", err);
    console.error("❌ Error stack:", err.stack);
    res.status(500).json({
      success: false,
      message: "Failed to load owner payments",
      error: err.message
    });
  }
};

// Optional: Add summary endpoint
exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const ownerId = req.user.mysqlId || req.user.id;

    const [rows] = await db.query(`
      SELECT 
        COUNT(DISTINCT b.id) as total_bookings,
        COUNT(DISTINCT CASE WHEN p.status = 'paid' THEN b.id END) as verified_payments,
        COUNT(DISTINCT CASE WHEN p.status = 'submitted' THEN b.id END) as pending_approval,
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN b.owner_amount ELSE 0 END), 0) as total_earned
      FROM bookings b
      JOIN pgs pg ON pg.id = b.pg_id
      LEFT JOIN payments p ON b.id = p.booking_id
      WHERE b.owner_id = ?
    `, [ownerId]);

    res.json({
      success: true,
      data: rows[0] || {
        total_bookings: 0,
        verified_payments: 0,
        pending_approval: 0,
        total_earned: 0
      }
    });

  } catch (err) {
    console.error("❌ SUMMARY ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load summary"
    });
  }
};