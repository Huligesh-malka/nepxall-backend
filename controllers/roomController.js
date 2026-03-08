const db = require("../db");

/* ===============================
   ADD ROOM
================================ */

exports.addRoom = (req, res) => {
  const { pg_id, room_no, total_seats } = req.body;

  if (!pg_id || !room_no || !total_seats) {
    return res.status(400).json({
      success: false,
      message: "pg_id, room_no and total_seats are required",
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
        message: "Room add failed",
      });
    }

    res.json({
      success: true,
      message: "Room added successfully",
      roomId: result.insertId,
    });
  });
};



/* ===============================
   GET ROOMS BY PG
================================ */

exports.getRoomsByPG = (req, res) => {

  const pgId = req.params.pgId;

  console.log("Fetching rooms for PG:", pgId);

  const sql = `
    SELECT 
      id,
      pg_id,
      room_no,
      total_seats,
      occupied_seats,
      status
    FROM pg_rooms
    WHERE pg_id = ?
    ORDER BY room_no ASC
  `;

  db.query(sql, [pgId], (err, rows) => {

    if (err) {
      console.error("GET ROOMS ERROR:", err);

      return res.status(500).json({
        success: false,
        message: "Database error",
      });
    }

    return res.json({
      success: true,
      data: rows || [],
    });

  });

};