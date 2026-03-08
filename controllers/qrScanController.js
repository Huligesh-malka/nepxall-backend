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

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PG ID format"
      });
    }

    /* ================= GET PG DETAILS ================= */

    const [pgRows] = await db.query(
      `SELECT 
        id,
        pg_name,
        pg_type,
        pg_category,
        city,
        area,
        address,
        landmark,
        latitude,
        longitude,
        rent_amount,
        deposit_amount,
        maintenance_amount,
        description,
        contact_person,
        contact_phone,

        food_available,
        wifi_available,
        ac_available,
        parking_available,
        laundry_available,
        cctv,
        security_guard,
        power_backup,
        lift_elevator,
        gym,
        housekeeping,
        water_24x7,

        couple_allowed,
        smoking_allowed,
        drinking_allowed,
        pets_allowed,
        visitor_allowed,
        outside_food_allowed,

        photos,
        status

       FROM pgs
       WHERE id = ? AND is_deleted = 0`,
      [id]
    );

    if (pgRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }

    const pg = pgRows[0];

    pg.photos = safeParsePhotos(pg.photos);

    /* ================= GET ROOMS ================= */

    const [roomRows] = await db.query(
      `SELECT 
        id,
        room_no,
        room_type,
        total_seats,
        occupied_seats,
        rent,
        deposit
      FROM pg_rooms 
      WHERE pg_id = ? AND status != 'full'
      ORDER BY rent ASC`,
      [id]
    );

    /* ================= ROOM DETAILS ================= */

    pg.available_room_details = roomRows.map(room => ({
      id: room.id,
      room_number: room.room_no,
      sharing_type: room.room_type,
      available_beds: room.total_seats - room.occupied_seats,
      price: room.rent,
      security_deposit: room.deposit
    }));

    /* ================= AVAILABILITY SUMMARY ================= */

    const summary = {};

    roomRows.forEach(room => {
      const type = room.room_type || "Standard";

      if (!summary[type]) summary[type] = 0;

      summary[type] += (room.total_seats - room.occupied_seats);
    });

    pg.availability_summary = summary;

    /* ================= AMENITIES ================= */

    pg.amenities = {
      wifi: !!pg.wifi_available,
      food: !!pg.food_available,
      ac: !!pg.ac_available,
      parking: !!pg.parking_available,
      laundry: !!pg.laundry_available,
      cctv: !!pg.cctv,
      security: !!pg.security_guard,
      power_backup: !!pg.power_backup,
      lift: !!pg.lift_elevator,
      gym: !!pg.gym,
      housekeeping: !!pg.housekeeping,
      water_24x7: !!pg.water_24x7
    };

    /* ================= RULES ================= */

    pg.rules = {
      couple_allowed: !!pg.couple_allowed,
      smoking_allowed: !!pg.smoking_allowed,
      drinking_allowed: !!pg.drinking_allowed,
      pets_allowed: !!pg.pets_allowed,
      visitor_allowed: !!pg.visitor_allowed,
      outside_food_allowed: !!pg.outside_food_allowed
    };

    console.log(`✅ QR scan successful. Found ${roomRows.length} available rooms.`);

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

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PG ID format"
      });
    }

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