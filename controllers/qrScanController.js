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
/* ================= GET PG DATA FOR QR SCAN ================= */
exports.getPGScanData = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🔍 QR Code scanned for PG ID: ${id}`);

    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid PG ID format" });
    }

    // 1. Fetch PG Details
    const [pgRows] = await db.query(
      `SELECT id, pg_name, pg_type, city, area, address, landmark, 
              rent_amount, deposit_amount, photos, status, description
       FROM pgs WHERE id = ? AND is_deleted = 0`,
      [id]
    );

    if (pgRows.length === 0) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    const pg = pgRows[0];
    pg.photos = safeParsePhotos(pg.photos);

    // 2. Fetch ALL Available Rooms for this PG
    // We only want rooms where status is 'empty' or 'partial'
    const [roomRows] = await db.query(
      `SELECT room_no, room_type, total_seats, occupied_seats, rent, deposit
       FROM pg_rooms 
       WHERE pg_id = ? AND status != 'full'
       ORDER BY rent ASC`,
      [id]
    );

    // 3. Attach room data to the PG object
    pg.available_room_details = roomRows.map(room => ({
      room_number: room.room_no,
      sharing_type: room.room_type, // e.g., 'Double Sharing', 'Single'
      available_beds: room.total_seats - room.occupied_seats,
      price: room.rent,
      security_deposit: room.deposit
    }));

    // Optional: Create a summary of sharing types
    const summary = {};
    roomRows.forEach(room => {
        const type = room.room_type || "Standard";
        if (!summary[type]) summary[type] = 0;
        summary[type] += (room.total_seats - room.occupied_seats);
    });
    pg.availability_summary = summary;

    console.log(`✅ QR scan successful. Found ${roomRows.length} available rooms.`);

    res.json({
      success: true,
      data: pg
    });

  } catch (error) {
    console.error("❌ QR SCAN ERROR:", error);
    res.status(500).json({ success: false, message: "Server error" });
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