const db = require("../db");

exports.getOwnerPayments = async (req, res) => {
  try {
    console.log("User from auth:", req.user); // Debug: check if user is attached
    
    const ownerId = req.user.id;
    console.log("Owner ID:", ownerId); // Debug: check owner ID

    // First, check if there are any bookings for this owner
    const [checkBookings] = await db.query(
      "SELECT COUNT(*) as count FROM bookings WHERE owner_id = ?",
      [ownerId]
    );
    console.log("Total bookings for owner:", checkBookings[0].count);

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
        b.total_amount AS user_payment
      FROM bookings b
      LEFT JOIN pgs pg ON pg.id = b.pg_id 
      WHERE b.owner_id = ? 
      AND LOWER(b.status) IN ('confirmed', 'approved', 'completed', 'paid')
      ORDER BY b.created_at DESC
    `, [ownerId]);

    console.log("Query results:", rows); // Debug: see what data is returned

    const formattedData = rows.map(row => ({
      booking_id: row.booking_id,
      tenant_name: row.tenant_name || 'N/A',
      phone: row.phone || 'N/A',
      pg_name: row.pg_name || 'N/A',
      owner_amount: row.owner_amount || 0,
      payment_status: row.payment_status || 'PENDING',
      owner_settlement: row.owner_settlement || 'PENDING',
      user_payment: row.user_payment || 0,
      booking_status: row.booking_status
    }));

    res.json({ 
      success: true, 
      data: formattedData
    });

  } catch (err) {
    console.error("PAYMENT ERROR:", err);
    res.status(500).json({ 
      success: false, 
      message: "Database error"
    });
  }
};