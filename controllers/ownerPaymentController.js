const db = require("../db");

exports.getOwnerPayments = async (req, res) => {
  try {
    const ownerId = req.user.id;

    // Only show payments that have been verified/approved by admin
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
      LEFT JOIN payments p ON b.id = p.booking_id
      WHERE b.owner_id = ? 
      AND p.status = 'paid'  -- Only show when admin has verified (status = 'paid')
      AND b.status IN ('confirmed', 'approved', 'agreement_ready')
      ORDER BY p.created_at DESC, b.created_at DESC
    `, [ownerId]);

    // Format the data to match your desired output format
    const formattedData = rows.map(row => ({
      tenant_name: row.tenant_name,
      phone: row.phone,
      pg_name: row.pg_name,
      amount: row.owner_amount || row.payment_amount || 0,
      booking_id: row.booking_id,
      payment_status: row.payment_status,
      settlement_status: row.owner_settlement,
      settlement_date: row.settlement_date,
      order_id: row.order_id,
      payment_date: row.payment_date
    }));

    res.json({
      success: true,
      data: formattedData,
      count: formattedData.length
    });

  } catch (err) {
    console.error("OWNER PAYMENTS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load owner payments"
    });
  }
};

// Optional: Get payment details for a specific booking (only if verified)
exports.getOwnerPaymentDetails = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { bookingId } = req.params;

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
      LEFT JOIN payments p ON b.id = p.booking_id
      WHERE b.owner_id = ? 
      AND b.id = ?
      AND p.status = 'paid'  -- Only show if verified
    `, [ownerId, bookingId]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment not found or not yet approved by admin"
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });

  } catch (err) {
    console.error("OWNER PAYMENT DETAILS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load payment details"
    });
  }
};

// Optional: Get settlement summary for owner dashboard
exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const [rows] = await db.query(`
      SELECT 
        COUNT(*) as total_settlements,
        SUM(CASE WHEN owner_settlement = 'PENDING' THEN 1 ELSE 0 END) as pending_settlements,
        SUM(CASE WHEN owner_settlement = 'COMPLETED' THEN 1 ELSE 0 END) as completed_settlements,
        SUM(owner_amount) as total_amount,
        SUM(CASE WHEN owner_settlement = 'PENDING' THEN owner_amount ELSE 0 END) as pending_amount,
        SUM(CASE WHEN owner_settlement = 'COMPLETED' THEN owner_amount ELSE 0 END) as completed_amount
      FROM bookings b
      JOIN payments p ON b.id = p.booking_id
      WHERE b.owner_id = ? 
      AND p.status = 'paid'  -- Only count admin-approved payments
      AND b.status IN ('confirmed', 'approved', 'agreement_ready')
    `, [ownerId]);

    res.json({
      success: true,
      data: rows[0] || {
        total_settlements: 0,
        pending_settlements: 0,
        completed_settlements: 0,
        total_amount: 0,
        pending_amount: 0,
        completed_amount: 0
      }
    });

  } catch (err) {
    console.error("OWNER SETTLEMENT SUMMARY ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load settlement summary"
    });
  }
};