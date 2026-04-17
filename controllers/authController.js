const db = require("../db");

/* ================= REGISTER / LOGIN USER ================= */
exports.registerUser = async (req, res) => {
  try {
    const { name, phone } = req.body;

    // 🔐 From Firebase middleware
    const firebase_uid = req.user.firebase_uid;
    const email = req.user.email || null;

    //////////////////////////////////////////////////////
    // 🔐 VALIDATION
    //////////////////////////////////////////////////////

    if (!firebase_uid) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Firebase UID missing",
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone is required",
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

    //////////////////////////////////////////////////////
    // ✅ CASE 1: USER EXISTS
    //////////////////////////////////////////////////////

    if (existingUser) {

      // 🔥 UPDATE NAME IF NOT SET OR WRONG (phone saved as name)
      if (
        name &&
        (
          !existingUser.name ||
          existingUser.name.startsWith("+") ||
          existingUser.name === existingUser.phone
        )
      ) {
        await db.query(
          "UPDATE users SET name = ? WHERE firebase_uid = ?",
          [name, firebase_uid]
        );

        const [[updatedUser]] = await db.query(
          "SELECT * FROM users WHERE firebase_uid = ?",
          [firebase_uid]
        );

        return res.json({
          success: true,
          message: "User updated successfully ✅",
          user: updatedUser,
        });
      }

      // ✅ NORMAL LOGIN (NO NAME ASK)
      return res.json({
        success: true,
        message: "User already exists ✅",
        user: existingUser,
      });
    }

    //////////////////////////////////////////////////////
    // ✅ CASE 2: NEW USER (FIRST TIME)
    //////////////////////////////////////////////////////

    const [result] = await db.query(
      `INSERT INTO users 
       (name, phone, firebase_uid, role, mobile_verified, email, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name || null,        // ✅ DO NOT SAVE PHONE AS NAME
        phone,
        firebase_uid,
        "tenant",            // ✅ ALWAYS tenant first
        1,
        email,
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