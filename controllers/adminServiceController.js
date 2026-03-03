const db = require("../db");

/* =====================================================
   GET ALL SERVICE BOOKINGS (ADMIN)
===================================================== */
exports.getAllServiceBookings = async (req, res) => {
  try {

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access only"
      });
    }

    const [rows] = await db.query(`
      SELECT 
        sb.*,
        u.name AS user_name,
        v.name AS vendor_name
      FROM service_bookings sb
      JOIN users u ON u.id = sb.user_id
      LEFT JOIN users v ON v.id = sb.assigned_vendor_id
      ORDER BY sb.created_at DESC
    `);

    res.json({ success: true, data: rows });

  } catch (err) {
    console.error("GET ALL SERVICES ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch services"
    });
  }
};


/* =====================================================
   GET VERIFIED VENDORS LIST (FOR DROPDOWN)
===================================================== */
exports.getVerifiedVendors = async (req, res) => {
  try {

    const [rows] = await db.query(`
      SELECT u.id, u.name, vd.service_type
      FROM users u
      JOIN vendor_details vd ON vd.user_id = u.id
      WHERE u.role = 'vendor'
        AND vd.verification_status = 'verified'
    `);

    res.json({ success: true, vendors: rows });

  } catch (err) {
    console.error("GET VENDORS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch vendors"
    });
  }
};


/* =====================================================
   ASSIGN VENDOR TO SERVICE
===================================================== */
exports.assignVendor = async (req, res) => {
  try {

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access only"
      });
    }

    const { serviceId, vendorId } = req.body;

    if (!serviceId || !vendorId) {
      return res.status(400).json({
        success: false,
        message: "Service ID and Vendor ID required"
      });
    }

    /* ✅ Check service exists */
    const [[service]] = await db.query(
      `SELECT id FROM service_bookings WHERE id = ?`,
      [serviceId]
    );

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    /* ✅ Check vendor exists & verified */
    const [[vendor]] = await db.query(
      `SELECT u.id
       FROM users u
       JOIN vendor_details vd ON vd.user_id = u.id
       WHERE u.id = ?
         AND u.role = 'vendor'
         AND vd.verification_status = 'verified'`,
      [vendorId]
    );

    if (!vendor) {
      return res.status(400).json({
        success: false,
        message: "Invalid or unverified vendor"
      });
    }

    /* ✅ Assign Vendor */
    await db.query(
      `UPDATE service_bookings
       SET assigned_vendor_id = ?, 
           vendor_status = 'approved'
       WHERE id = ?`,
      [vendorId, serviceId]
    );

    res.json({
      success: true,
      message: "Vendor assigned successfully"
    });

  } catch (err) {
    console.error("ASSIGN VENDOR ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Assignment failed"
    });
  }
};


/* =====================================================
   ADMIN SERVICE SUMMARY (OPTIONAL ANALYTICS)
===================================================== */
exports.getServiceSummary = async (req, res) => {
  try {

    const [[summary]] = await db.query(`
      SELECT
        COUNT(*) AS total_services,
        SUM(amount) AS total_amount,
        SUM(commission) AS total_commission,
        SUM(CASE WHEN vendor_status = 'completed' THEN 1 ELSE 0 END) AS completed_services
      FROM service_bookings
    `);

    res.json({ success: true, summary });

  } catch (err) {
    console.error("SERVICE SUMMARY ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch summary"
    });
  }
};