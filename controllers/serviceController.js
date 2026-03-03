const db = require("../db"); 

//////////////////////////////////////////////////
// BOOK SERVICE
//////////////////////////////////////////////////
exports.bookService = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      bookingId,
      serviceType,
      serviceDate,
      address,
      notes,
      amount
    } = req.body;

    // Basic validation
    if (!bookingId || !serviceType || !serviceDate || !address || !amount) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided"
      });
    }

    if (Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount"
      });
    }

    // Commission 15%
    const commission = Number(amount) * 0.15;

    // Check booking belongs to user
    const [booking] = await db.query(
      `SELECT id FROM bookings WHERE id = ? AND user_id = ?`,
      [bookingId, userId]
    );

    if (!booking.length) {
      return res.status(403).json({
        success: false,
        message: "Invalid booking"
      });
    }

    await db.query(
      `INSERT INTO service_bookings
      (booking_id, user_id, service_type, service_date, address, notes, amount, commission)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookingId,
        userId,
        serviceType,
        serviceDate,
        address,
        notes || null,
        amount,
        commission
      ]
    );

    res.status(201).json({
      success: true,
      message: "Service booked successfully"
    });

  } catch (err) {
    console.error("BOOK SERVICE ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

//////////////////////////////////////////////////
// GET USER SERVICES
//////////////////////////////////////////////////
exports.getUserServices = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.query(
      `SELECT *
       FROM service_bookings
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      services: rows
    });

  } catch (err) {
    console.error("GET USER SERVICES ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

//////////////////////////////////////////////////
// GET OWNER SERVICES
//////////////////////////////////////////////////
exports.getOwnerServices = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const [rows] = await db.query(
      `SELECT sb.*, b.pg_id, b.id AS booking_id
       FROM service_bookings sb
       JOIN bookings b ON sb.booking_id = b.id
       JOIN pgs p ON b.pg_id = p.id
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
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

//////////////////////////////////////////////////
// UPDATE SERVICE STATUS (OWNER ONLY)
//////////////////////////////////////////////////
exports.updateServiceStatus = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;
    const { vendor_status } = req.body;

    const allowedStatus = [
      "pending",
      "approved",
      "in_progress",
      "completed",
      "cancelled"
    ];

    if (!allowedStatus.includes(vendor_status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value"
      });
    }

    // Ensure service belongs to owner
    const [service] = await db.query(
      `SELECT sb.id
       FROM service_bookings sb
       JOIN bookings b ON sb.booking_id = b.id
       JOIN pgs p ON b.pg_id = p.id
       WHERE sb.id = ? AND p.owner_id = ?`,
      [id, ownerId]
    );

    if (!service.length) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized"
      });
    }

    await db.query(
      `UPDATE service_bookings
       SET vendor_status = ?
       WHERE id = ?`,
      [vendor_status, id]
    );

    res.json({
      success: true,
      message: "Service status updated"
    });

  } catch (err) {
    console.error("UPDATE SERVICE STATUS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};