const db = require("../db");

/* ================= SAFE PARSE PHOTOS HELPER ================= */
const safeParsePhotos = (value) => {
  if (!value) return [];
  if (Buffer.isBuffer(value)) value = value.toString("utf8");
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

/* ================= GET PG DATA FOR QR SCAN ================= */
exports.getPGScanData = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🔍 QR Code scanned for PG ID: ${id}`);

    // Validate ID
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PG ID format"
      });
    }

    // Fetch only required PG details - no extra tables or complex operations
    const [rows] = await db.query(
      `SELECT
        id,
        pg_name,
        pg_type,
        city,
        area,
        address,
        landmark,
        rent_amount,
        deposit_amount,
        available_rooms,
        total_rooms,
        contact_person,
        contact_phone,
        description,
        photos,
        status
      FROM pgs
      WHERE id = ?
      AND is_deleted = 0`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }

    const pg = rows[0];

    // Parse photos
    pg.photos = safeParsePhotos(pg.photos);
    
    // Add simple computed fields
    pg.is_available = pg.status === 'active';
    
    if (pg.status !== 'active') {
      pg.status_message = "Currently unavailable";
    }

    console.log(`✅ QR scan successful for PG: ${pg.pg_name}`);

    res.json({
      success: true,
      data: pg
    });

  } catch (error) {
    console.error("❌ QR SCAN ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

/* ================= TRACK QR SCAN ================= */
exports.trackQRScan = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📊 Tracking scan for PG ID: ${id}`);

    // Validate ID
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PG ID format"
      });
    }

    // Simple success response - no database operations
    res.json({
      success: true,
      message: "Scan tracked"
    });

  } catch (error) {
    console.error("Error tracking QR scan:", error);
    res.json({
      success: true,
      message: "Scan received"
    });
  }
};

/* ================= GET SCAN STATISTICS ================= */
exports.getScanStatistics = async (req, res) => {
  try {
    const { id } = req.params;

    // Return empty stats for now
    res.json({
      success: true,
      data: {
        total_scans: 0,
        recent_scans: 0,
        daily_trend: []
      }
    });

  } catch (error) {
    console.error("Error getting scan statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get scan statistics"
    });
  }
};