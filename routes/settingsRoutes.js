const express = require("express");
const router = express.Router();
const db = require("../db");
const firebaseAuth = require("../middlewares/authMiddleware");

// GET USER SETTINGS
router.get("/", firebaseAuth, async (req, res) => {
  try {
    const uid = req.user.uid;

    const [rows] = await db.query(
      `SELECT 
        name,
        phone
      FROM users
      WHERE firebase_uid = ?`,
      [uid]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      user: rows[0]
    });

  } catch (error) {
    console.error("Settings Fetch Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// UPDATE SETTINGS - Only name and phone
router.put("/", firebaseAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { name, phone } = req.body;

    // Update only name and phone fields
    await db.query(
      `UPDATE users SET
        name = ?,
        phone = ?
      WHERE firebase_uid = ?`,
      [name, phone, uid]
    );

    res.json({
      success: true,
      message: "Settings updated successfully"
    });

  } catch (error) {
    console.error("Settings Update Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

module.exports = router;