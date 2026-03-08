exports.getPGScanData = async (req, res) => {
  try {
    const { id } = req.params;

    const [pgRows] = await db.query(
      `SELECT 
        id,
        pg_name,
        area,
        city,
        deposit_amount,
        maintenance_amount,
        single_sharing,
        double_sharing,
        triple_sharing,
        four_sharing,
        single_room,
        double_room,
        food_available,
        wifi_available,
        ac_available
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

    pg.available_room_details = roomRows.map(room => ({
      id: room.id,
      room_number: room.room_no,
      sharing_type: room.room_type,
      available_beds: room.total_seats - room.occupied_seats
    }));

    res.json({
      success: true,
      data: pg
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};