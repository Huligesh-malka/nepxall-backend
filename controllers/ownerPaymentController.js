const db = require("../db");

exports.getOwnerPayments = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.name AS tenant_name,
        b.phone,
        b.owner_amount,
        b.owner_settlement,
        b.payment_status,
        b.status AS booking_status,
        b.created_at,
        pg.pg_name,
        pg.id AS pg_id,
        b.total_amount AS user_payment,
        b.payment_method,
        b.payment_date
      FROM bookings b
      LEFT JOIN pgs pg ON pg.id = b.pg_id 
      WHERE b.owner_id = ? 
      AND b.status IN ('confirmed', 'CONFIRMED', 'approved', 'completed')
      ORDER BY 
        CASE 
          WHEN b.owner_settlement = 'DONE' THEN 2 
          ELSE 1 
        END,
        b.created_at DESC
    `, [ownerId]);

    // Format the data to match frontend expectations
    const formattedData = rows.map(row => ({
      booking_id: row.booking_id,
      tenant_name: row.tenant_name,
      phone: row.phone,
      pg_name: row.pg_name || 'N/A',
      owner_amount: row.owner_amount || 0,
      payment_status: row.payment_status || 'PENDING',
      owner_settlement: row.owner_settlement || 'PENDING',
      user_payment: row.user_payment || 0,
      booking_status: row.booking_status,
      payment_method: row.payment_method,
      payment_date: row.payment_date,
      pg_id: row.pg_id
    }));

    res.json({ 
      success: true, 
      data: formattedData,
      message: formattedData.length === 0 ? "No payment records found" : "Payment records retrieved successfully"
    });

  } catch (err) {
    console.error("PAYMENT ERROR:", err);
    res.status(500).json({ 
      success: false, 
      message: "Database error", 
      error: err.message 
    });
  }
};

// Optional: Add a endpoint to update settlement status
exports.updateSettlementStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { settlementStatus } = req.body;
    const ownerId = req.user.id;

    // Verify the booking belongs to this owner
    const [booking] = await db.query(
      "SELECT id FROM bookings WHERE id = ? AND owner_id = ?",
      [bookingId, ownerId]
    );

    if (booking.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Booking not found or unauthorized" 
      });
    }

    await db.query(
      "UPDATE bookings SET owner_settlement = ? WHERE id = ?",
      [settlementStatus, bookingId]
    );

    res.json({ 
      success: true, 
      message: "Settlement status updated successfully" 
    });

  } catch (err) {
    console.error("UPDATE SETTLEMENT ERROR:", err);
    res.status(500).json({ 
      success: false, 
      message: "Database error" 
    });
  }
};

// Optional: Add endpoint to get payment summary/stats
exports.getPaymentSummary = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const [summary] = await db.query(`
      SELECT 
        COUNT(CASE WHEN owner_settlement = 'DONE' THEN 1 END) as settled_count,
        COUNT(CASE WHEN owner_settlement != 'DONE' OR owner_settlement IS NULL THEN 1 END) as pending_count,
        SUM(CASE WHEN owner_settlement = 'DONE' THEN owner_amount ELSE 0 END) as total_settled,
        SUM(CASE WHEN owner_settlement != 'DONE' OR owner_settlement IS NULL THEN owner_amount ELSE 0 END) as total_pending,
        SUM(owner_amount) as total_earnings
      FROM bookings 
      WHERE owner_id = ? 
      AND status IN ('confirmed', 'CONFIRMED', 'approved', 'completed')
    `, [ownerId]);

    res.json({ 
      success: true, 
      data: {
        settled_count: summary[0]?.settled_count || 0,
        pending_count: summary[0]?.pending_count || 0,
        total_settled: summary[0]?.total_settled || 0,
        total_pending: summary[0]?.total_pending || 0,
        total_earnings: summary[0]?.total_earnings || 0
      }
    });

  } catch (err) {
    console.error("PAYMENT SUMMARY ERROR:", err);
    res.status(500).json({ 
      success: false, 
      message: "Database error" 
    });
  }
};