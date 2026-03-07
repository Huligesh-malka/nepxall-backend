const db = require("../db");

exports.getOwnerPayments = async (req, res) => {
  try {
    console.log("🔥 getOwnerPayments called");
    
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }

    const ownerId = req.user.id;
    console.log("🔍 Owner ID from token:", ownerId);

    // Query joining bookings and payments tables
    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.name AS tenant_name,
        b.phone,
        b.owner_amount AS booking_owner_amount,
        b.owner_settlement,
        b.status AS booking_status,
        b.created_at,
        b.check_in_date,
        b.room_type,
        b.rent_amount,
        b.security_deposit,
        b.maintenance_amount,
        b.duration,
        pg.pg_name,
        p.id AS payment_id,
        p.amount AS payment_amount,
        p.status AS payment_status,
        p.platform_fee,
        p.owner_amount AS payment_owner_amount,
        p.order_id,
        p.utr,
        p.screenshot,
        p.verified_by_admin,
        p.created_at AS payment_date
      FROM bookings b
      LEFT JOIN pgs pg ON pg.id = b.pg_id 
      LEFT JOIN payments p ON p.booking_id = b.id
      WHERE b.owner_id = ? 
      AND b.status IN ('pending', 'approved', 'confirmed', 'completed')
      ORDER BY 
        CASE 
          WHEN p.status = 'paid' THEN 1
          WHEN p.status = 'submitted' THEN 2
          ELSE 3
        END,
        b.created_at DESC
    `, [ownerId]);

    console.log(`✅ Found ${rows.length} bookings with payments`);

    // Format the data for frontend
    const formattedData = rows.map(row => {
      // Determine payment status
      let paymentStatus = 'PENDING';
      if (row.payment_status) {
        paymentStatus = row.payment_status.toUpperCase();
      } else if (row.booking_status === 'confirmed' || row.booking_status === 'completed') {
        paymentStatus = 'PAID';
      } else if (row.booking_status === 'approved') {
        paymentStatus = 'PENDING';
      }

      // Get user payment amount
      const userPayment = Number(row.payment_amount || 0) || 
        ((Number(row.rent_amount || 0) * Number(row.duration || 6)) + 
         Number(row.security_deposit || 0) + 
         Number(row.maintenance_amount || 0));

      // Get owner amount
      const ownerAmount = Number(row.payment_owner_amount || row.booking_owner_amount || 0);

      return {
        booking_id: row.booking_id,
        tenant_name: row.tenant_name || 'N/A',
        phone: row.phone || 'N/A',
        pg_name: row.pg_name || 'N/A',
        owner_amount: ownerAmount,
        payment_status: paymentStatus,
        owner_settlement: row.owner_settlement || 'PENDING',
        user_payment: userPayment,
        booking_status: row.booking_status,
        order_id: row.order_id,
        payment_id: row.payment_id,
        utr: row.utr,
        verified_by_admin: row.verified_by_admin ? true : false,
        payment_date: row.payment_date
      };
    });

    res.json({ 
      success: true, 
      data: formattedData
    });

  } catch (err) {
    console.error("❌ PAYMENT ERROR:", err);
    res.status(500).json({ 
      success: false, 
      message: "Database error: " + err.message 
    });
  }
};

// Add this debug endpoint temporarily
exports.debugOwnerPayments = async (req, res) => {
  try {
    const ownerId = req.user.id;
    
    // Get all bookings for this owner
    const [bookings] = await db.query(
      "SELECT id, name, owner_id, status FROM bookings WHERE owner_id = ?",
      [ownerId]
    );
    
    // Get all payments
    const [payments] = await db.query("SELECT * FROM payments");
    
    // Find matching payments
    const matchingPayments = payments.filter(p => 
      bookings.some(b => b.id === p.booking_id)
    );

    res.json({
      success: true,
      debug: {
        owner_id: ownerId,
        total_bookings: bookings.length,
        total_payments: payments.length,
        matching_payments: matchingPayments.length,
        bookings: bookings,
        payments_sample: payments.slice(0, 10)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};