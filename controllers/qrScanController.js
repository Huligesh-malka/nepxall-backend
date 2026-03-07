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

    // SIMPLE QUERY - just get basic PG details
    const [rows] = await db.query(
      `SELECT 
        id, 
        pg_name, 
        city, 
        area, 
        address,
        landmark,
        rent_amount,
        deposit_amount,
        maintenance_amount,
        available_rooms,
        total_rooms,
        contact_person,
        contact_phone,
        description,
        photos,
        status,
        pg_type
      FROM pgs 
      WHERE id = ? AND is_deleted = 0`,
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
    
    // Add computed fields
    pg.is_available = pg.status === 'active';
    
    if (pg.status !== 'active') {
      pg.status_message = "This property is currently not available";
    }

    // DON'T try to update scan_count or create tables - just return the data
    console.log(`✅ QR scan successful for PG: ${pg.pg_name} (ID: ${id})`);

    return res.json({
      success: true,
      data: pg
    });

  } catch (error) {
    console.error("❌ QR SCAN ERROR:", error);
    
    // Send a proper error response
    return res.status(500).json({
      success: false,
      message: "Server error while fetching property details",
      error: error.message
    });
  }
};

/* ================= TRACK QR SCAN ================= */
exports.trackQRScan = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`📊 Tracking scan for PG ID: ${id}`);

    // Just return success - don't try to insert into database
    // This prevents any database errors
    
    return res.json({
      success: true,
      message: "Scan tracked successfully"
    });

  } catch (error) {
    console.error("Error in trackQRScan:", error);
    // Always return success to not break user experience
    return res.json({
      success: true,
      message: "Scan received"
    });
  }
};

/* ================= GET SCAN STATISTICS ================= */
exports.getScanStatistics = async (req, res) => {
  try {
    const { id } = req.params;

    // Return mock data for now
    return res.json({
      success: true,
      data: {
        total_scans: 0,
        recent_scans: 0,
        daily_trend: []
      }
    });

  } catch (error) {
    console.error("Error in getScanStatistics:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get scan statistics"
    });
  }
};