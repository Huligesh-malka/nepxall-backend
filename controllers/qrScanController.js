const db = require("../db");

exports.getPGScanData = async (req, res) => {
  try {
    const { id } = req.params;

    // Updated query to include all price-related fields
    const [pgRows] = await db.query(
      `SELECT 
        id, pg_name, pg_category, description, area, city, road, landmark, address,
        rent_amount, deposit_amount, maintenance_amount,
        single_sharing, double_sharing, triple_sharing, four_sharing,
        single_room, double_room, triple_room,
        price_1bhk, price_2bhk, price_3bhk, price_4bhk,
        security_deposit_1bhk, security_deposit_2bhk, security_deposit_3bhk, security_deposit_4bhk,
        bhk_type, furnishing_type,
        food_available, food_charges,
        wifi_available, ac_available, parking_available, power_backup, cctv, gym,
        total_rooms, available_rooms,
        contact_person, contact_phone, contact_email,
        pg_type
      FROM pgs
      WHERE id = ? AND is_deleted = 0`,
      [id]
    );

    if (!pgRows.length) {
      return res.status(404).json({ success: false, message: "PG not found" });
    }

    const pg = pgRows[0];

    // Get available rooms from pg_rooms table
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
      price: room.rent
    }));

    res.json({ success: true, data: pg });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Track QR scan
exports.trackQRScan = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📊 Tracking scan for PG ID: ${id}`);
    res.json({ success: true, message: "Scan tracked" });
  } catch (error) {
    console.error("Error tracking QR scan:", error);
    res.json({ success: true, message: "Scan received" });
  }
};

// Get scan statistics
exports.getScanStatistics = async (req, res) => {
  try {
    const { id } = req.params;
    res.json({
      success: true,
      data: { total_scans: 0, recent_scans: 0, daily_trend: [] }
    });
  } catch (error) {
    console.error("Error getting scan statistics:", error);
    res.status(500).json({ success: false, message: "Failed to get scan statistics" });
  }
};