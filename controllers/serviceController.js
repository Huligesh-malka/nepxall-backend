const db = require("../db");

/**
 * BOOK A SERVICE
 * POST /api/services/book
 */
exports.bookService = async (req, res) => {
  try {
    const userId = req.user.id || req.user.id; 

    const {
      bookingId,
      serviceType,
      serviceDate,
      address,
      notes,
      amount
    } = req.body;

    // Validation
    if (!serviceType || !serviceDate || !address || !amount) {
      return res.status(400).json({
        success: false,
        message: "All required fields (type, date, address, amount) must be provided"
      });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount provided"
      });
    }

    // Calculate 15% commission
    const commission = numAmount * 0.15;

    const [result] = await db.query(
      `INSERT INTO service_bookings 
      (booking_id, user_id, service_type, service_date, address, notes, amount, commission) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookingId || null,
        userId,
        serviceType,
        serviceDate,
        address,
        notes || null,
        numAmount,
        commission
      ]
    );

    res.status(201).json({
      success: true,
      message: "Service booked successfully",
      bookingId: result.insertId
    });

  } catch (err) {
    console.error("BOOK SERVICE ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET SERVICES FOR LOGGED IN USER
 * GET /api/services/user
 */
exports.getUserServices = async (req, res) => {
  try {
    const userId = req.user.id || req.user.id;

    const [rows] = await db.query(
      `SELECT * FROM service_bookings WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      services: rows
    });
  } catch (err) {
    console.error("GET USER SERVICES ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * GET SERVICES FOR OWNER (Linked via PG)
 * GET /api/services/owner
 */
exports.getOwnerServices = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const [rows] = await db.query(
      `SELECT sb.*, b.pg_id, p.name as pg_name
       FROM service_bookings sb
       INNER JOIN bookings b ON sb.booking_id = b.id
       INNER JOIN pgs p ON b.pg_id = p.id
       WHERE p.owner_id = ?
       ORDER BY sb.created_at DESC`,
      [ownerId]
    );

    res.json({
      success: true,
      services: rows
    });
  } catch (err) {
    console.error("GET OWNER SERVICES ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * UPDATE SERVICE STATUS (OWNER ONLY)
 * PUT /api/services/status/:id
 */
exports.updateServiceStatus = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;
    const { vendor_status } = req.body;

    const allowedStatus = ["pending", "approved", "in_progress", "completed", "cancelled"];

    if (!allowedStatus.includes(vendor_status)) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }

    // Verify ownership of the PG associated with this service booking
    const [service] = await db.query(
      `SELECT sb.id FROM service_bookings sb
       INNER JOIN bookings b ON sb.booking_id = b.id
       INNER JOIN pgs p ON b.pg_id = p.id
       WHERE sb.id = ? AND p.owner_id = ?`,
      [id, ownerId]
    );

    if (service.length === 0) {
      return res.status(403).json({ success: false, message: "Unauthorized or service not found" });
    }

    await db.query(
      `UPDATE service_bookings SET vendor_status = ? WHERE id = ?`,
      [vendor_status, id]
    );

    res.json({ success: true, message: `Service status updated to ${vendor_status}` });

  } catch (err) {
    console.error("UPDATE SERVICE STATUS ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};