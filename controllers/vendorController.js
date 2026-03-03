const db = require("../db");

/**
 * GET ASSIGNED SERVICES FOR VENDOR
 */
exports.getVendorServices = async (req, res) => {
  try {
    const vendorId = req.user.id;

    const [rows] = await db.query(
      `SELECT * FROM service_bookings
       WHERE assigned_vendor_id = ?
       ORDER BY created_at DESC`,
      [vendorId]
    );

    res.json({ success: true, services: rows });

  } catch (err) {
    console.error("GET VENDOR SERVICES ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * UPDATE SERVICE STATUS (VENDOR)
 */
exports.updateVendorServiceStatus = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;
    const { vendor_status } = req.body;

    const allowedStatus = ["approved", "in_progress", "completed", "cancelled"];

    if (!allowedStatus.includes(vendor_status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const [service] = await db.query(
      `SELECT id FROM service_bookings
       WHERE id = ? AND assigned_vendor_id = ?`,
      [id, vendorId]
    );

    if (!service.length) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    await db.query(
      `UPDATE service_bookings
       SET vendor_status = ?
       WHERE id = ?`,
      [vendor_status, id]
    );

    res.json({ success: true, message: "Status updated" });

  } catch (err) {
    console.error("UPDATE VENDOR STATUS ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};