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
      // Check if user has a valid name
      const hasValidName = user.name && 
        user.name.trim() !== "" && 
        user.name !== user.phone &&
        !user.name.startsWith("+") &&
        !/^[0-9]+$/.test(user.name);

      // If name is being updated
      if (name && name.trim()) {
        const isValidName = name.trim().length >= 3 && !/^[0-9+]+$/.test(name);
        
        if (!isValidName) {
          return res.json({
            success: false,
            message: "Please enter a valid name (not phone number)",
            needsName: true,
            isExistingUser: true
          });
        }

        // Update user's name
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
          isExistingUser: true,
          message: "Profile updated successfully"
        });
      }

      // Return existing user info
      return res.json({
        success: true,
        user: user,
        needsName: !hasValidName,
        isExistingUser: true,
        message: hasValidName ? "Welcome back!" : "Please complete your profile"
      });
    }

    //////////////////////////////////////////////////////
    // 🆕 NEW USER - Create account without name
    //////////////////////////////////////////////////////
    const cleanPhone = phone.replace(/^\+91/, "").replace(/\D/g, "");
    
    // Insert user without name (name will be collected later)
    const [result] = await db.query(
      `INSERT INTO users 
       (name, phone, firebase_uid, role, mobile_verified, email, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        null,  // Name will be set in the next step
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

    // Return needsName: true for new users
    return res.json({
      success: true,
      user: newUser,
      needsName: true,
      isExistingUser: false,
      message: "Please complete your profile"
    });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};