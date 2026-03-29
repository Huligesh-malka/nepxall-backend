const db = require("../db");

exports.getOwnerPayments = async (req, res) => {
  try {
    const ownerId = req.user.mysqlId || req.user.id;
    
    console.log("🔍 Fetching payments & agreements for owner ID:", ownerId);

    // Join with agreement_form to get the final_pdf column
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
        p.utr,
        af.final_pdf              /* <--- Fetching from agreement_form table */
      FROM bookings b
      JOIN pgs pg ON pg.id = b.pg_id
      INNER JOIN payments p ON b.id = p.booking_id
      LEFT JOIN agreement_form af ON b.id = af.booking_id  /* Joining the two tables */
      WHERE b.owner_id = ? 
      AND b.status IN ('confirmed', 'approved', 'agreement_ready')
      AND p.status = 'paid' 
      ORDER BY p.created_at DESC 
    `, [ownerId]);

    res.json({
      success: true,
      data: rows,
      count: rows.length
    });

  } catch (err) {
    console.error("❌ OWNER PAYMENTS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load owner payments",
      error: err.message
    });
  }
};

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
      AND p.status = 'paid' 
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
    res.status(500).json({ success: false, message: "Failed to load summary" });
  }
};