const db = require("../db");

/* ================= REGISTER / LOGIN USER ================= */
exports.registerUser = async (req, res) => {
  try {
    const { name, phone, idToken } = req.body;
    
    // Get firebase_uid from token if not in request
    const firebase_uid = req.user?.firebase_uid || req.body.firebase_uid;
    const email = req.user?.email || null;

    if (!firebase_uid) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No Firebase UID",
      });
    }

    console.log("Processing user:", { firebase_uid, phone, name });

    //////////////////////////////////////////////////////
    // 🔍 CHECK EXISTING USER
    //////////////////////////////////////////////////////
    const [[existingUser]] = await db.query(
      "SELECT * FROM users WHERE firebase_uid = ?",
      [firebase_uid]
    );

    //////////////////////////////////////////////////////
    // ✅ EXISTING USER FOUND
    //////////////////////////////////////////////////////
    if (existingUser) {
      console.log("Existing user found:", existingUser);
      
      // Check if user has a valid name (not null, not empty, not a phone number)
      const hasValidName = existingUser.name && 
        existingUser.name.trim() !== "" && 
        existingUser.name !== existingUser.phone &&
        !existingUser.name.startsWith("+") &&
        !/^[0-9]+$/.test(existingUser.name);

      // If name is provided in request, update it
      if (name && name.trim() && !hasValidName) {
        const isValidName = name.trim().length >= 3 && !/^[0-9+]+$/.test(name);
        
        if (!isValidName) {
          return res.json({
            success: false,
            message: "Please enter a valid name (minimum 3 characters, not a phone number)",
            needsName: true,
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
          isNewUser: false,
          message: "Profile updated successfully"
        });
      }

      // Return existing user info
      return res.json({
        success: true,
        user: existingUser,
        needsName: !hasValidName,
        isNewUser: false,
        message: hasValidName ? "Welcome back!" : "Please complete your profile"
      });
    }

    //////////////////////////////////////////////////////
    // 🆕 NEW USER - Create complete account in one go
    //////////////////////////////////////////////////////
    const cleanPhone = phone.replace(/^\+91/, "").replace(/\D/g, "");
    
    // Validate name for new user
    if (!name || !name.trim()) {
      return res.json({
        success: false,
        message: "Name is required for new users",
        needsName: true,
      });
    }
    
    const isValidName = name.trim().length >= 3 && !/^[0-9+]+$/.test(name);
    
    if (!isValidName) {
      return res.json({
        success: false,
        message: "Please enter a valid name (minimum 3 characters, not a phone number)",
        needsName: true,
      });
    }
    
    // Insert new user with name
    const [result] = await db.query(
      `INSERT INTO users 
       (name, phone, firebase_uid, role, mobile_verified, email, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),  // Store name immediately
        cleanPhone,
        firebase_uid,
        "tenant",
        1,
        email,
        new Date(),
        new Date(),
      ]
    );

    const [[newUser]] = await db.query(
      "SELECT * FROM users WHERE id = ?",
      [result.insertId]
    );

    console.log("New user created with name:", newUser);

    return res.json({
      success: true,
      user: newUser,
      needsName: false,  // No need for name collection
      isNewUser: true,
      message: "Account created successfully!"
    });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({
      success: false,
      message: "Server error: " + err.message,
    });
  }
};