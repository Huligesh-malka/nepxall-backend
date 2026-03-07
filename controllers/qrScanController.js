const db = require("../db"); // same db connection used in your main controller

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

    // Fetch comprehensive PG details
    const [rows] = await db.query(
      `
      SELECT
        p.id,
        p.pg_name,
        p.pg_type,
        p.pg_category,
        p.city,
        p.area,
        p.address,
        p.location,
        p.landmark,
        p.rent_amount,
        p.deposit_amount,
        p.maintenance_amount,
        p.available_rooms,
        p.total_rooms,
        p.single_sharing,
        p.double_sharing,
        p.triple_sharing,
        p.four_sharing,
        p.single_room,
        p.double_room,
        p.triple_room,
        p.contact_person,
        p.contact_phone,
        p.contact_email,
        p.description,
        p.photos,
        p.food_available,
        p.food_type,
        p.ac_available,
        p.wifi_available,
        p.parking_available,
        p.cctv,
        p.gym,
        p.status,
        p.created_at,
        p.updated_at,
        u.name as owner_name,
        u.phone as owner_phone,
        u.email as owner_email
      FROM pgs p
      LEFT JOIN users u ON u.id = p.owner_id
      WHERE p.id = ?
      AND p.is_deleted = 0
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Property not found or has been removed"
      });
    }

    const pg = rows[0];

    // Check if PG is active
    if (pg.status !== 'active') {
      return res.json({
        success: true,
        data: {
          ...pg,
          photos: safeParsePhotos(pg.photos),
          is_available: false,
          status_message: "This property is currently not available for booking"
        }
      });
    }

    // Parse photos
    pg.photos = safeParsePhotos(pg.photos);
    
    // Get first photo for preview
    pg.preview_photo = pg.photos && pg.photos.length > 0 ? pg.photos[0] : null;

    // Add computed fields
    pg.is_available = true;
    pg.total_sharing_options = [
      pg.single_sharing,
      pg.double_sharing,
      pg.triple_sharing,
      pg.four_sharing
    ].filter(price => price !== null && price > 0).length;

    pg.total_room_options = [
      pg.single_room,
      pg.double_room,
      pg.triple_room
    ].filter(price => price !== null && price > 0).length;

    // Increment scan count (track how many times QR is scanned)
    try {
      await db.query(
        "UPDATE pgs SET scan_count = IFNULL(scan_count, 0) + 1 WHERE id = ?",
        [id]
      );
    } catch (scanError) {
      console.error("Error updating scan count:", scanError);
      // Don't fail the request if scan count update fails
    }

    // Log scan for analytics (optional)
    try {
      await db.query(
        `INSERT INTO qr_scans (pg_id, scanned_at, ip_address, user_agent) 
         VALUES (?, NOW(), ?, ?)`,
        [id, req.ip || null, req.headers['user-agent'] || null]
      );
    } catch (logError) {
      console.error("Error logging QR scan:", logError);
      // Don't fail the request if logging fails
    }

    console.log(`✅ QR scan successful for PG: ${pg.pg_name} (ID: ${id})`);

    res.json({
      success: true,
      data: pg,
      message: pg.status === 'active' ? "Property found" : "Property found but currently unavailable"
    });

  } catch (error) {
    console.error("❌ QR SCAN ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Server error while fetching property details",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/* ================= TRACK QR SCAN (Optional - for analytics) ================= */
exports.trackQRScan = async (req, res) => {
  try {
    const { id } = req.params;
    const { source } = req.body;

    await db.query(
      `INSERT INTO qr_scans (pg_id, scanned_at, source, ip_address, user_agent) 
       VALUES (?, NOW(), ?, ?, ?)`,
      [id, source || 'direct', req.ip || null, req.headers['user-agent'] || null]
    );

    res.json({
      success: true,
      message: "Scan tracked successfully"
    });

  } catch (error) {
    console.error("Error tracking QR scan:", error);
    res.status(500).json({
      success: false,
      message: "Failed to track scan"
    });
  }
};

/* ================= GET SCAN STATISTICS (Optional - for owners) ================= */
exports.getScanStatistics = async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 30 } = req.query;

    // Get total scans
    const [totalScans] = await db.query(
      `SELECT COUNT(*) as total FROM qr_scans WHERE pg_id = ?`,
      [id]
    );

    // Get scans in last N days
    const [recentScans] = await db.query(
      `SELECT COUNT(*) as recent FROM qr_scans 
       WHERE pg_id = ? AND scanned_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [id, days]
    );

    // Get daily scan trend
    const [dailyTrend] = await db.query(
      `SELECT DATE(scanned_at) as date, COUNT(*) as count 
       FROM qr_scans 
       WHERE pg_id = ? 
         AND scanned_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY DATE(scanned_at)
       ORDER BY date DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        total_scans: totalScans[0]?.total || 0,
        recent_scans: recentScans[0]?.recent || 0,
        daily_trend: dailyTrend || []
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