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
      // Check if user needs to provide name (name is null, empty, or same as phone)
      const needsName = !existingUser.name || 
                        existingUser.name.trim() === "" || 
                        existingUser.name === existingUser.phone;

      // If name is provided and user needs name, update it
      if (name && needsName) {
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
          needsName: false,
        });
      }

      // Return user with needsName flag
      return res.json({
        success: true,
        message: "User already exists ✅",
        user: existingUser,
        needsName: needsName,
      });
    }

    //////////////////////////////////////////////////////
    // ✅ CASE 2: NEW USER (FIRST TIME)
    //////////////////////////////////////////////////////

    // Store phone temporarily as name (indicates needs update)
    const [result] = await db.query(
      `INSERT INTO users 
       (name, phone, firebase_uid, role, mobile_verified, email, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        phone,  // Store phone as name to indicate this user needs to provide real name
        phone,
        firebase_uid,
        "tenant",
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

    // Always return needsName: true for new users
    res.json({
      success: true,
      message: "User registered successfully ✅",
      user: newUser,
      needsName: true, // Force name collection for new users
    });

  } catch (err) {
    console.error("Register error:", err);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};