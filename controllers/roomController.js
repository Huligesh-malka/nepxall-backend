const db = require("../db");

/* ================= ADD ROOM ================= */

exports.addRoom = (req, res) => {

  const { pg_id, room_no, total_seats } = req.body;

  if (!pg_id || !room_no || !total_seats) {
    return res.status(400).json({
      success: false,
      message: "pg_id, room_no and total_seats are required"
    });
  }

  const sql = `
    INSERT INTO pg_rooms
    (pg_id, room_no, total_seats, occupied_seats, status)
    VALUES (?, ?, ?, 0, 'empty')
  `;

  db.query(sql, [pg_id, room_no, total_seats], (err, result) => {

    if (err) {
      console.error("ADD ROOM ERROR:", err);
      return res.status(500).json({
        success: false,
        message: "Room add failed"
      });
    }

    res.json({
      success: true,
      message: "Room added successfully"
    });

  });

};


/* ================= GET ROOMS ================= */

exports.getRoomsByPG = (req, res) => {
  const pgId = req.params.pgId;

  // 1. Log this to see if the request reaches the server immediately
  console.log(`⏱️ Request received for PG: ${pgId} at ${new Date().toISOString()}`);

  const sql = `SELECT * FROM pg_rooms WHERE pg_id = ? ORDER BY room_no ASC`;

  db.query(sql, [pgId], (err, rows) => {
    if (err) {
      console.error("❌ DB ERROR:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    console.log(`✅ Query finished. Found ${rows.length} rooms.`);
    res.json({
      success: true,
      data: rows
    });
  });
};