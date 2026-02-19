const db = require("../db");

/* ===============================
   ADD ROOM (OWNER)
================================ */
exports.addRoom = (req, res) => {
  const { pg_id, room_no, total_seats } = req.body;

  // ✅ VALIDATION (THIS PREVENTS 400 CONFUSION)
  if (!pg_id || !room_no || !total_seats) {
    return res.status(400).json({
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
        return res.status(500).json({ message: "Room add failed" });
      }

      res.json({ message: "Room added successfully ✅" });
    }
  );
};

/* ===============================
   GET ROOMS BY PG
================================ */
exports.getRoomsByPG = (req, res) => {
  db.query(
    "SELECT * FROM pg_rooms WHERE pg_id = ?",
    [req.params.pgId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "DB error" });
      res.json(rows);
    }
  );
};
