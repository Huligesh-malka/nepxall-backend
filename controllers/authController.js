const db = require("../db");

/* ================= REGISTER USER ================= */
exports.registerUser = async (req, res) => {
  try {
    const { name, phone, role } = req.body;

    const firebase_uid= req.user.uid; // 🔐 from verifyToken middleware

    if (!name || !phone || !role) {
      return res.status(400).json({ message: "All fields required" });
    }

    /* 🔎 CHECK USER ALREADY EXISTS */
    const [existing] = await db.query(
      "SELECT * FROM users WHERE firebase_uid = ?",
      [firebase_uid]
    );

    if (existing.length > 0) {
      return res.json({
        message: "User already registered ✅",
        user: existing[0],
      });
    }

    /* ➕ INSERT NEW USER */
    const [result] = await db.query(
      `INSERT INTO users (name, phone, role, firebase_uid)
       VALUES (?, ?, ?, ?)`,
      [name, phone, role, firebase_uid]
    );

    /* 📦 RETURN CREATED USER */
    const [newUser] = await db.query(
      "SELECT * FROM users WHERE id = ?",
      [result.insertId]
    );

    res.json({
      message: "User registered successfully ✅",
      user: newUser[0],
    });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
