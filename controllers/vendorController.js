const db = require("../db");

/* ======================================================
   GET SERVICES ASSIGNED TO VENDOR
====================================================== */
exports.getVendorServices = async (req, res) => {
  try {

    const vendorId = req.user.id || req.user.id;

    const [rows] = await db.query(
      `
      SELECT 
        sb.id,
        sb.service_type,
        sb.service_date,
        sb.address,
        sb.notes,
        sb.amount,
        sb.commission,
        sb.vendor_status,
        sb.payment_status,
        sb.created_at,

        u.name AS tenant_name,
        u.phone AS tenant_phone

      FROM service_bookings sb
      JOIN users u ON u.id = sb.user_id
      WHERE sb.assigned_vendor_id = ?
      ORDER BY sb.created_at DESC
      `,
      [vendorId]
    );

    res.json({
      success: true,
      services: rows
    });

  } catch (err) {
    console.error("GET VENDOR SERVICES ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Failed to fetch services"
    });
  }
};



/* ======================================================
   UPDATE SERVICE STATUS (VENDOR ACTION)
====================================================== */
exports.updateVendorServiceStatus = async (req, res) => {
  try {

    const vendorId = req.user.id || req.user.id;
    const { id } = req.params;
    const { vendor_status } = req.body;

    const allowedStatus = [
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

    /* Check if this job belongs to vendor */

    const [service] = await db.query(
      `
      SELECT id 
      FROM service_bookings
      WHERE id = ? 
      AND assigned_vendor_id = ?
      `,
      [id, vendorId]
    );

    if (!service.length) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized service update"
      });
    }

    await db.query(
      `
      UPDATE service_bookings
      SET vendor_status = ?
      WHERE id = ?
      `,
      [vendor_status, id]
    );

    res.json({
      success: true,
      message: "Service status updated"
    });

  } catch (err) {
    console.error("UPDATE VENDOR STATUS ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};