const db = require("../db");

/* ================= REGISTER USER ================= */
exports.registerUser = async (req, res) => {
  try {
    const { name, phone } = req.body;

    // 🔐 From Firebase middleware
    const firebase_uid = req.user.firebase_uid;

    //////////////////////////////////////////////////////
    // 🔐 VALIDATION
    //////////////////////////////////////////////////////

    if (!firebase_uid) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Firebase UID missing",
      });
    }

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name and phone are required",
      });
    }

    if (!/^[0-9]{10,15}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Enter valid phone number",
      });
    }

    //////////////////////////////////////////////////////
    // 🔍 CHECK EXISTING USER
    //////////////////////////////////////////////////////

    const [[existingUser]] = await db.query(
      "SELECT * FROM users WHERE firebase_uid = ?",
      [firebase_uid]
    );

    if (existingUser) {
      return res.json({
        success: true,
        message: "User already exists ✅",
        user: existingUser,
      });
    }

    //////////////////////////////////////////////////////
    // 🆕 CREATE USER (DEFAULT TENANT ONLY)
    //////////////////////////////////////////////////////

    const [result] = await db.query(
      `INSERT INTO users 
       (name, phone, firebase_uid, role, mobile_verified, created_at) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name,
        phone,
        firebase_uid,
        "tenant", // ✅ ALWAYS tenant first (REAL WORLD)
        1,
        new Date()
      ]
    );

    //////////////////////////////////////////////////////
    // 📦 FETCH NEW USER
    //////////////////////////////////////////////////////

    const [[newUser]] = await db.query(
      "SELECT * FROM users WHERE id = ?",
      [result.insertId]
    );

    res.json({
      success: true,
      message: "User registered successfully ✅",
      user: newUser,
    });

  } catch (err) {
    console.error("Register error:", err);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};