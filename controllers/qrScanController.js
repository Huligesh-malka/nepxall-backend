const db = require("../db");

exports.getPGScanData = async (req, res) => {
  try {
    const { id } = req.params;

    // Updated query to match your provided table schema
    const [pgRows] = await db.query(
      `SELECT 
        id, pg_name, area, city, 
        rent_amount, deposit_amount, maintenance_amount,
        single_sharing, double_sharing, triple_sharing, four_sharing,
        single_room, double_room,
        price_1bhk, price_2bhk, price_3bhk,
        food_available, wifi_available, ac_available
      FROM pgs
      WHERE id = ? AND is_deleted = 0`,
      [id]
    );

    if (!pgRows.length) {
      return res.status(404).json({ success: false, message: "PG not found" });
    }

    const pg = pgRows[0];

    const [roomRows] = await db.query(
      `SELECT 
        id, room_no, room_type, total_seats, occupied_seats, rent, deposit
      FROM pg_rooms
      WHERE pg_id = ? AND status != 'full'
      ORDER BY rent ASC`,
      [id]
    );

    pg.available_room_details = roomRows.map(room => ({
      id: room.id,
      room_number: room.room_no,
      sharing_type: room.room_type,
      available_beds: room.total_seats - room.occupied_seats,
      price: room.rent // Added price per room
    }));

    res.json({ success: true, data: pg });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ... keep other functions (trackQRScan, getScanStatistics) as they were
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