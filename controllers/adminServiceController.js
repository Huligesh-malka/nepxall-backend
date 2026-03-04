const db = require("../db");

/* ======================================================
   GET ALL SERVICE BOOKINGS
   ====================================================== */
exports.getAllServiceBookings = async (req, res) => {
  try {

    const [rows] = await db.query(`
      SELECT 
        sb.id,
        sb.service_type,
        sb.service_date,
        sb.amount,
        sb.vendor_status,
        sb.assigned_vendor_id,
        u.name AS tenant_name,
        v.name AS vendor_name
      FROM service_bookings sb
      JOIN users u ON u.id = sb.user_id
      LEFT JOIN users v ON v.id = sb.assigned_vendor_id
      ORDER BY sb.created_at DESC
    `);

    return res.json({
      success: true,
      data: rows || []
    });

  } catch (err) {
    console.error("GET SERVICES ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch services"
    });
  }
};



/* ======================================================
   GET ALL VENDORS
   ====================================================== */
exports.getVendors = async (req, res) => {
  try {

    const [rows] = await db.query(`
      SELECT 
        id,
        name
      FROM users
      WHERE role = 'vendor'
      ORDER BY name ASC
    `);

    return res.json({
      success: true,
      vendors: rows || []
    });

  } catch (err) {
    console.error("GET VENDORS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendors"
    });
  }
};



/* ======================================================
   ASSIGN VENDOR
   ====================================================== */
exports.assignVendor = async (req, res) => {
  try {

    const { serviceId, vendorId } = req.body;

    if (!serviceId || !vendorId) {
      return res.status(400).json({
        success: false,
        message: "Service ID and Vendor ID required"
      });
    }

    /* Check service exists */
    const [service] = await db.query(
      "SELECT id FROM service_bookings WHERE id=?",
      [serviceId]
    );

    if (!service.length) {
      return res.status(404).json({
        success: false,
        message: "Service booking not found"
      });
    }

    /* Check vendor exists */
    const [vendor] = await db.query(
      "SELECT id FROM users WHERE id=? AND role='vendor'",
      [vendorId]
    );

    if (!vendor.length) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found"
      });
    }

    /* Assign vendor */
    await db.query(`
      UPDATE service_bookings
      SET 
        assigned_vendor_id = ?,
        vendor_status = 'approved'
      WHERE id = ?
    `, [vendorId, serviceId]);

    return res.json({
      success: true,
      message: "Vendor assigned successfully"
    });

  } catch (err) {
    console.error("ASSIGN VENDOR ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to assign vendor"
    });
  }
};