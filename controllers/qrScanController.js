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

    // First, check if the qr_scans table exists, if not create it
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS qr_scans (
          id INT PRIMARY KEY AUTO_INCREMENT,
          pg_id INT NOT NULL,
          scanned_at DATETIME NOT NULL,
          source VARCHAR(50) DEFAULT 'direct',
          ip_address VARCHAR(45),
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_pg_id (pg_id),
          INDEX idx_scanned_at (scanned_at)
        )
      `);
      
      // Add scan_count column if it doesn't exist
      await db.query(`
        ALTER TABLE pgs 
        ADD COLUMN IF NOT EXISTS scan_count INT DEFAULT 0
      `);
    } catch (tableError) {
      console.log("Table creation error (might already exist):", tableError.message);
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

    // Parse photos
    pg.photos = safeParsePhotos(pg.photos);
    
    // Get first photo for preview
    pg.preview_photo = pg.photos && pg.photos.length > 0 ? pg.photos[0] : null;

    // Add computed fields
    pg.is_available = pg.status === 'active';
    
    // Calculate total sharing options
    const sharingOptions = [
      pg.single_sharing,
      pg.double_sharing,
      pg.triple_sharing,
      pg.four_sharing
    ];
    pg.total_sharing_options = sharingOptions.filter(price => price !== null && price > 0).length;

    // Calculate total room options
    const roomOptions = [
      pg.single_room,
      pg.double_room,
      pg.triple_room
    ];
    pg.total_room_options = roomOptions.filter(price => price !== null && price > 0).length;

    // Add status message if not active
    if (pg.status !== 'active') {
      pg.status_message = "This property is currently not available for booking";
    }

    // Try to increment scan count, but don't fail if it doesn't work
    try {
      await db.query(
        "UPDATE pgs SET scan_count = IFNULL(scan_count, 0) + 1 WHERE id = ?",
        [id]
      );
    } catch (scanError) {
      console.error("Error updating scan count:", scanError.message);
      // Don't fail the request if scan count update fails
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

/* ================= TRACK QR SCAN ================= */
exports.trackQRScan = async (req, res) => {
  try {
    const { id } = req.params;
    const { source } = req.body;

    console.log(`📊 Tracking scan for PG ID: ${id}`);

    // Validate ID
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PG ID format"
      });
    }

    // Insert scan record
    await db.query(
      `INSERT INTO qr_scans (pg_id, scanned_at, source, ip_address, user_agent) 
       VALUES (?, NOW(), ?, ?, ?)`,
      [id, source || 'direct', req.ip || req.connection.remoteAddress || null, req.headers['user-agent'] || null]
    );

    res.json({
      success: true,
      message: "Scan tracked successfully"
    });

  } catch (error) {
    console.error("Error tracking QR scan:", error);
    // Return success even if tracking fails - don't break the user experience
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
    const { days = 30 } = req.query;

    console.log(`📊 Getting scan statistics for PG ID: ${id}`);

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

    // Get daily scan trend (last 7 days)
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