const db = require("../db");

/* ================= GET ROOMS BY PG ================= */
exports.getRoomsByPG = async (req, res) => {
  const pgId = req.params.pgId;
  console.log(`⏱️ DB START: Fetching rooms for PG ${pgId}`);

  try {
    // 1. Using a promise-based query with a timeout race
    const [rows] = await db.query(
      "SELECT * FROM pg_rooms WHERE pg_id = ? ORDER BY room_no ASC",
      [pgId]
    );

    console.log(`✅ DB SUCCESS: Found ${rows.length} rooms`);
    
    return res.json({
      success: true,
      data: rows || []
    });

  } catch (err) {
    console.error("❌ ROOMS FETCH ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Database error occurred",
      error: err.message
    });
  }
};

/* ================= ADD ROOM ================= */
exports.addRoom = async (req, res) => {
  const { pg_id, room_no, total_seats } = req.body;

  if (!pg_id || !room_no || !total_seats) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  try {
    const sql = `
      INSERT INTO pg_rooms (pg_id, room_no, total_seats, occupied_seats, status)
      VALUES (?, ?, ?, 0, 'empty')
    `;
    
    await db.query(sql, [pg_id, room_no, total_seats]);

    return res.json({ success: true, message: "Room added successfully" });
  } catch (err) {
    console.error("❌ ADD ROOM ERROR:", err);
    return res.status(500).json({ success: false, message: "Room add failed" });
  }
};