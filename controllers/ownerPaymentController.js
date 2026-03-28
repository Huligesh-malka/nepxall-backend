const db = require("../db");

exports.getOwnerPayments = async (req, res) => {
  try {
    // IMPORTANT: Use mysqlId from auth middleware, not id
    const ownerId = req.user.mysqlId || req.user.id;
    
    console.log("🔍 Fetching payments for owner ID:", ownerId);

    // Fixed SQL query - ONLY show payments with status = 'paid' (admin approved)
    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.name AS tenant_name,
        b.phone,
        b.owner_amount,
        b.owner_settlement,
        b.settlement_date,
        b.status AS booking_status,
        pg.pg_name,
        p.status AS payment_status,
        p.order_id,
        p.amount AS payment_amount,
        p.created_at AS payment_date,
        p.utr
      FROM bookings b
      JOIN pgs pg ON pg.id = b.pg_id
      INNER JOIN payments p ON b.id = p.booking_id  /* Changed from LEFT JOIN to INNER JOIN */
      WHERE b.owner_id = ? 
      AND b.status IN ('confirmed', 'approved', 'agreement_ready')
      AND p.status = 'paid'  /* ONLY show admin-approved payments */
      ORDER BY p.created_at DESC  /* Order by payment date, not booking date */
    `, [ownerId]);

    console.log(`📊 Found ${rows.length} approved payments for owner ${ownerId}`);

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

// Updated summary endpoint - only count approved payments
exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const ownerId = req.user.mysqlId || req.user.id;

    const [rows] = await db.query(`
      SELECT 
        COUNT(DISTINCT b.id) as total_approved_bookings,
        COUNT(DISTINCT CASE WHEN p.status = 'paid' THEN b.id END) as verified_payments,
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN b.owner_amount ELSE 0 END), 0) as total_earned,
        COUNT(DISTINCT CASE WHEN b.owner_settlement = 'PENDING' AND p.status = 'paid' THEN b.id END) as pending_settlements,
        COUNT(DISTINCT CASE WHEN b.owner_settlement = 'DONE' AND p.status = 'paid' THEN b.id END) as completed_settlements
      FROM bookings b
      JOIN pgs pg ON pg.id = b.pg_id
      INNER JOIN payments p ON b.id = p.booking_id
      WHERE b.owner_id = ?
      AND p.status = 'paid'  /* Only count approved payments */
      AND b.status IN ('confirmed', 'approved', 'agreement_ready')
    `, [ownerId]);

    res.json({
      success: true,
      data: {
        total_bookings: rows[0]?.total_approved_bookings || 0,
        verified_payments: rows[0]?.verified_payments || 0,
        total_earned: rows[0]?.total_earned || 0,
        pending_settlements: rows[0]?.pending_settlements || 0,
        completed_settlements: rows[0]?.completed_settlements || 0
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