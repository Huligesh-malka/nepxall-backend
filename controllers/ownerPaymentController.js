const db = require("../db");

////////////////////////////////////////////////////////////
// GET OWNER PAYMENTS - FIXED FOR YOUR SCHEMA
////////////////////////////////////////////////////////////
exports.getOwnerPayments = async (req, res) => {
  try {
    // Get owner ID from authenticated user
    const ownerId = req.user.id;
    
    console.log("🔍 Fetching payments for owner ID:", ownerId);

    // First, get all PGs owned by this owner using correct column names
    const [ownerPgs] = await db.query(
      "SELECT id, pg_name FROM pgs WHERE owner_id = ? AND status = 'active'",
      [ownerId]
    );
    
    console.log("🏠 Owner's PGs:", ownerPgs);

    if (ownerPgs.length === 0) {
      console.log("⚠️ No PGs found for this owner");
      return res.json({
        success: true,
        data: [],
        count: 0,
        debug: { 
          ownerId, 
          message: "No PGs found for this owner",
          pgCount: 0 
        }
      });
    }

    // Get all bookings for these PGs with payment details
    // Using correct column names from your schema
    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.name AS tenant_name,
        b.phone,
        b.owner_amount,
        b.owner_settlement,
        b.settlement_date,
        b.status AS booking_status,
        b.created_at AS booking_date,
        b.check_in_date,
        b.duration,
        b.room_type,
        pg.pg_name,
        pg.id AS pg_id,
        p.id AS payment_id,
        p.status AS payment_status,
        p.order_id,
        p.amount AS payment_amount,
        p.created_at AS payment_date,
        p.utr,
        p.verified_by_admin
      FROM bookings b
      INNER JOIN pgs pg ON pg.id = b.pg_id
      LEFT JOIN payments p ON b.id = p.booking_id
      WHERE pg.owner_id = ? 
      ORDER BY COALESCE(p.created_at, b.created_at) DESC
    `, [ownerId]);

    console.log(`📊 Found ${rows.length} records for owner ${ownerId}`);

    // Log payment status breakdown
    const statusCount = {
      paid: rows.filter(r => r.payment_status === 'paid').length,
      submitted: rows.filter(r => r.payment_status === 'submitted').length,
      pending: rows.filter(r => r.payment_status === 'pending').length,
      rejected: rows.filter(r => r.payment_status === 'rejected').length,
      no_payment: rows.filter(r => !r.payment_status).length
    };
    console.log("📊 Payment status breakdown:", statusCount);

    // Format the data for frontend
    const formattedData = rows.map(row => ({
      booking_id: row.booking_id,
      tenant_name: row.tenant_name || "N/A",
      phone: row.phone || "N/A",
      pg_name: row.pg_name || "N/A",
      amount: Number(row.owner_amount || row.payment_amount || 0),
      payment_status: row.payment_status || 'no_payment',
      owner_settlement: row.owner_settlement || 'PENDING',
      settlement_date: row.settlement_date,
      booking_date: row.booking_date,
      payment_date: row.payment_date,
      order_id: row.order_id,
      check_in_date: row.check_in_date,
      duration: row.duration,
      room_type: row.room_type,
      verified_by_admin: row.verified_by_admin
    }));

    res.json({
      success: true,
      data: formattedData,
      count: formattedData.length,
      debug: {
        ownerId: ownerId,
        pgCount: ownerPgs.length,
        pgNames: ownerPgs.map(pg => pg.pg_name),
        statusBreakdown: statusCount
      }
    });

  } catch (err) {
    console.error("❌ OWNER PAYMENTS ERROR:", err);
    console.error("❌ Error stack:", err.stack);
    res.status(500).json({
      success: false,
      message: "Failed to load owner payments",
      error: err.message,
      stack: err.stack
    });
  }
};

////////////////////////////////////////////////////////////
// GET SETTLEMENT SUMMARY - FIXED
////////////////////////////////////////////////////////////
exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const ownerId = req.user.id;

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

    const summary = {
      total_bookings: Number(rows[0]?.total_bookings) || 0,
      verified_payments: Number(rows[0]?.verified_payments) || 0,
      pending_approval: Number(rows[0]?.pending_approval) || 0,
      rejected_payments: Number(rows[0]?.rejected_payments) || 0,
      total_earned: Number(rows[0]?.total_earned) || 0,
      pending_settlement: Number(rows[0]?.pending_settlement) || 0,
      completed_settlement: Number(rows[0]?.completed_settlement) || 0
    };

    console.log("📊 Summary result:", summary);

    res.json({
      success: true,
      data: summary
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