const db = require("../db"); // same db connection used in your main controller

/* ================= GET PG DATA FOR QR SCAN ================= */

exports.getPGScanData = async (req, res) => {
  try {

    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        id,
        pg_name,
        city,
        area,
        location,
        rent_amount,
        available_rooms,
        total_rooms,
        single_sharing,
        double_sharing,
        triple_sharing,
        four_sharing,
        contact_phone,
        photos
      FROM pgs
      WHERE id = ?
      AND status = 'active'
      AND is_deleted = 0
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "PG not found"
      });
    }

    const pg = rows[0];

    // convert photos JSON
    try {
      pg.photos = JSON.parse(pg.photos || "[]");
    } catch {
      pg.photos = [];
    }

    res.json({
      success: true,
      data: pg
    });

  } catch (error) {

    console.error("QR SCAN ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }
};