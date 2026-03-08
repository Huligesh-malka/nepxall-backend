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

  db.query(
    `INSERT INTO pg_rooms
     (pg_id, room_no, total_seats, occupied_seats, status)
     VALUES (?, ?, ?, 0, 'empty')`,
    [pg_id, room_no, total_seats],
    (err) => {
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
      });
    }
  );
};

/* ===============================
   GET ROOMS BY PG
================================ */
exports.getRoomsByPG = (req, res) => {

  const pgId = req.params.pgId;

  db.query(
    "SELECT * FROM pg_rooms WHERE pg_id = ?",
    [pgId],
    (err, rows) => {

      if (err) {
        console.error("GET ROOMS ERROR:", err);
        return res.status(500).json({
          success:false,
          message:"DB error"
        });
      }

      res.json({
        success:true,
        data:rows
      });

    }
  );
};