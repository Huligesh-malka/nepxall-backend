const db = require("../db");

exports.getOwnerPayments = async (req, res) => {
  try {
    const ownerId = req.user.id;

    // Fixed query - removed the p.status = 'paid' condition temporarily to see all data
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
        pg.pg_name,
        p.id AS payment_id,
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
      ORDER BY COALESCE(p.created_at, b.created_at) DESC
    `, [ownerId]);

    // Format the data
    const formattedData = rows.map(row => ({
      booking_id: row.booking_id,
      tenant_name: row.tenant_name,
      phone: row.phone,
      pg_name: row.pg_name,
      amount: row.owner_amount || row.payment_amount || 0,
      payment_status: row.payment_status || 'no_payment',
      owner_settlement: row.owner_settlement || 'PENDING',
      settlement_date: row.settlement_date,
      booking_date: row.booking_date,
      payment_date: row.payment_date,
      order_id: row.order_id
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
      message: "Failed to load owner payments",
      error: err.message
    });
  }
};

// FIXED: Get settlement summary
exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const ownerId = req.user.id;

    console.log("Fetching summary for owner:", ownerId);

    // Fixed query - added COALESCE and proper joins
    const [rows] = await db.query(`
      SELECT 
        COUNT(DISTINCT b.id) as total_settlements,
        COUNT(DISTINCT CASE WHEN b.owner_settlement = 'PENDING' THEN b.id END) as pending_settlements,
        COUNT(DISTINCT CASE WHEN b.owner_settlement = 'COMPLETED' OR b.owner_settlement = 'DONE' THEN b.id END) as completed_settlements,
        COALESCE(SUM(b.owner_amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN b.owner_settlement = 'PENDING' THEN b.owner_amount ELSE 0 END), 0) as pending_amount,
        COALESCE(SUM(CASE WHEN b.owner_settlement = 'COMPLETED' OR b.owner_settlement = 'DONE' THEN b.owner_amount ELSE 0 END), 0) as completed_amount
      FROM bookings b
      JOIN pgs pg ON pg.id = b.pg_id
      LEFT JOIN payments p ON b.id = p.booking_id
      WHERE b.owner_id = ? 
      AND b.status IN ('confirmed', 'approved', 'agreement_ready')
    `, [ownerId]);

    console.log("Summary result:", rows[0]);

    // Ensure all values are numbers
    const summary = {
      total_settlements: Number(rows[0]?.total_settlements) || 0,
      pending_settlements: Number(rows[0]?.pending_settlements) || 0,
      completed_settlements: Number(rows[0]?.completed_settlements) || 0,
      total_amount: Number(rows[0]?.total_amount) || 0,
      pending_amount: Number(rows[0]?.pending_amount) || 0,
      completed_amount: Number(rows[0]?.completed_amount) || 0
    };

    res.json({
      success: true,
      data: summary
    });

  } catch (err) {
    console.error("OWNER SETTLEMENT SUMMARY ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load settlement summary",
      error: err.message
    });
  }
};

// Optional: Get payment details for a specific booking
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
    `, [ownerId, bookingId]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
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