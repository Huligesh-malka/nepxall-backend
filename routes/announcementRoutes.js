const express = require("express");
const router = express.Router();
const db = require("../db");
const auth = require("../middlewares/auth");

/* ======================================================
    📢 POST ANNOUNCEMENT (OWNER ONLY)
====================================================== */
router.post("/", auth, async (req, res) => {
  try {
    const { pg_id, message } = req.body;
    const userId = req.user.mysqlId; 

    if (!pg_id || !message?.trim()) {
      return res.status(400).json({ message: "Content required" });
    }

    // Verify Owner
    const [[pg]] = await db.query(
      "SELECT id FROM pgs WHERE id = ? AND owner_id = ?",
      [pg_id, userId]
    );

    if (!pg) {
      return res.status(403).json({ message: "Only owners can post." });
    }

    // Insert into DB
    const [result] = await db.query(
      "INSERT INTO announcements (pg_id, message) VALUES (?, ?)",
      [pg_id, message.trim()]
    );

    // Return the full object for Socket emission
    const newAnnouncement = {
      id: result.insertId,
      pg_id,
      message: message.trim(),
      created_at: new Date(),
      sender_role: 'owner'
    };

    res.status(201).json(newAnnouncement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================
    📜 GET ANNOUNCEMENTS (HISTORY)
====================================================== */
router.get("/pg/:pgId", auth, async (req, res) => {
  try {
    const { pgId } = req.params;
    const [rows] = await db.query(
      "SELECT * FROM announcements WHERE pg_id = ? ORDER BY created_at DESC",
      [pgId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Error fetching history" });
  }
});

module.exports = router;