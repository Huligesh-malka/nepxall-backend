exports.getPGScanData = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PG ID"
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
        description,
        contact_person,
        contact_phone,
        photos
      FROM pgs
      WHERE id = ? AND is_deleted = 0 AND status = 'active'`,
      [id]
    );

    if (pgRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "PG not found"
      });
    }

    const pg = pgRows[0];

    pg.photos = safeParsePhotos(pg.photos);

    /* ================= ROOMS ================= */

    const [roomRows] = await db.query(
      `SELECT 
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

    pg.available_rooms = roomRows.map(r => ({
      room_no: r.room_no,
      sharing_type: r.room_type,
      available_beds: r.total_seats - r.occupied_seats,
      rent: r.rent,
      deposit: r.deposit
    }));

    /* ================= SUMMARY ================= */

    const summary = {};

    roomRows.forEach(r => {
      const type = r.room_type || "Standard";
      if (!summary[type]) summary[type] = 0;
      summary[type] += r.total_seats - r.occupied_seats;
    });

    pg.availability_summary = summary;

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