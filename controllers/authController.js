const db = require("../db");

/* ================= REGISTER / LOGIN USER ================= */
exports.registerUser = async (req, res) => {
  try {
    const { name, phone } = req.body;

    const firebase_uid = req.user.firebase_uid;
    const email = req.user.email || null;

    if (!firebase_uid) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    //////////////////////////////////////////////////////
    // 🔍 CHECK EXISTING USER
    //////////////////////////////////////////////////////
    const [[user]] = await db.query(
      "SELECT * FROM users WHERE firebase_uid = ?",
      [firebase_uid]
    );

    //////////////////////////////////////////////////////
    // ✅ EXISTING USER
    //////////////////////////////////////////////////////
    if (user) {

      const needsName =
        !user.name ||
        user.name.trim() === "" ||
        user.name === user.phone ||
        user.name.startsWith("+") ||
        /^[0-9]+$/.test(user.name);

      //////////////////////////////////////////////////////
      // 🔒 VALIDATE NAME (🔥 MAIN FIX)
      //////////////////////////////////////////////////////
      const isValidName =
        name &&
        name.trim().length >= 3 &&
        !/^[0-9+]+$/.test(name); // ❌ reject phone numbers

      // ❌ If invalid name → force user again
      if (name && !isValidName) {
        return res.json({
          success: false,
          message: "Please enter a valid name (not phone number)",
          needsName: true,
        });
      }

      // ✅ Update only valid name
      if (isValidName && needsName) {
        await db.query(
          "UPDATE users SET name = ? WHERE firebase_uid = ?",
          [name.trim(), firebase_uid]
        );

        const [[updatedUser]] = await db.query(
          "SELECT * FROM users WHERE firebase_uid = ?",
          [firebase_uid]
        );

        return res.json({
          success: true,
          user: updatedUser,
          needsName: false,
        });
      }

      return res.json({
        success: true,
        user,
        needsName,
      });
    }

    //////////////////////////////////////////////////////
    // 🆕 NEW USER
    //////////////////////////////////////////////////////
    const cleanPhone = phone.replace(/^\+91/, "");

    const [result] = await db.query(
      `INSERT INTO users 
       (name, phone, firebase_uid, role, mobile_verified, email, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        null,              // ❌ DO NOT store phone as name
        cleanPhone,
        firebase_uid,
        "tenant",
        1,
        email,
        new Date(),
      ]
    );

    const [[newUser]] = await db.query(
      "SELECT * FROM users WHERE id = ?",
      [result.insertId]
    );

    return res.json({
      success: true,
      user: newUser,
      needsName: true, // 🔥 FORCE name step
    });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};