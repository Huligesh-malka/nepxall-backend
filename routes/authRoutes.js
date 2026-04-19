const express = require("express");
const router = express.Router();

const jwt = require("jsonwebtoken");
const admin = require("../firebaseAdmin");
const db = require("../db");

const authMiddleware = require("../middlewares/authMiddleware");
const { registerUser } = require("../controllers/authController");

/////////////////////////////////////////////////////////
// 🔥 FIREBASE LOGIN / CHECK USER
/////////////////////////////////////////////////////////
router.post("/firebase", async (req, res) => {
  try {
    const { idToken, role: requestedRole, phone } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, message: "Token missing" });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const firebase_uid = decoded.uid;
    const email = decoded.email || null;
    const firebase_phone = decoded.phone_number || phone || null;

    console.log("Firebase check for UID:", firebase_uid);

    // Check if user exists in database
    const [rows] = await db.query(
      "SELECT * FROM users WHERE firebase_uid = ? LIMIT 1",
      [firebase_uid]
    );

    let user;
    let needsName = true;
    let isNewUser = false;

    if (!rows.length) {
      // New user - create basic record without name
      console.log("Creating new user record");
      isNewUser = true;
      
      const allowedRoles = ["tenant", "owner", "vendor"];
      const safeRequestedRole = (requestedRole || "").toLowerCase().trim();
      const role = allowedRoles.includes(safeRequestedRole) ? safeRequestedRole : "tenant";

      const cleanPhone = firebase_phone ? firebase_phone.replace(/^\+91/, "").replace(/\D/g, "") : null;

      const [result] = await db.query(
        `INSERT INTO users 
         (firebase_uid, name, email, phone, role, mobile_verified, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [firebase_uid, null, email, cleanPhone, role, 1]
      );

      const [[newUser]] = await db.query(
        "SELECT * FROM users WHERE id = ?",
        [result.insertId]
      );
      
      user = newUser;
      needsName = true; // New user needs to provide name
    } else {
      // Existing user
      user = rows[0];
      isNewUser = false;
      
      // Check if user has a valid name
      const hasValidName = user.name && 
        user.name.trim() !== "" && 
        user.name !== user.phone &&
        !user.name.startsWith("+") &&
        !/^[0-9]+$/.test(user.name);
      
      needsName = !hasValidName;
      
      console.log("Existing user found, has valid name:", !needsName);
      
      // Update missing info if needed
      if (!user.phone && firebase_phone) {
        const cleanPhone = firebase_phone.replace(/^\+91/, "").replace(/\D/g, "");
        await db.query("UPDATE users SET phone = ? WHERE id = ?", [cleanPhone, user.id]);
        user.phone = cleanPhone;
      }
      
      if (!user.email && email) {
        await db.query("UPDATE users SET email = ? WHERE id = ?", [email, user.id]);
        user.email = email;
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        firebase_uid: user.firebase_uid,
        role: user.role,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Store token in localStorage on client side
    // Send response with clear structure
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        firebase_uid: user.firebase_uid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        mobile_verified: user.mobile_verified
      },
      role: user.role,
      needsName: needsName,
      isNewUser: isNewUser,
      message: needsName ? "Please complete your profile" : "Welcome back!"
    });

  } catch (err) {
    console.error("🔥 FIREBASE ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Firebase auth failed",
      error: err.message
    });
  }
});

/////////////////////////////////////////////////////////
// ✅ REGISTER / UPDATE USER NAME
/////////////////////////////////////////////////////////
router.post("/register", authMiddleware, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const firebase_uid = req.user.firebase_uid;
    
    console.log("Register/Update user:", { firebase_uid, name, phone });

    if (!firebase_uid) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No Firebase UID",
      });
    }

    // Get existing user
    const [[existingUser]] = await db.query(
      "SELECT * FROM users WHERE firebase_uid = ?",
      [firebase_uid]
    );

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Validate name
    if (!name || !name.trim()) {
      return res.json({
        success: false,
        message: "Name is required",
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
    
    // Update user's name
    await db.query(
      "UPDATE users SET name = ?, updated_at = NOW() WHERE firebase_uid = ?",
      [name.trim(), firebase_uid]
    );

    // Get updated user
    const [[updatedUser]] = await db.query(
      "SELECT * FROM users WHERE firebase_uid = ?",
      [firebase_uid]
    );

    // Generate new token with updated name
    const token = jwt.sign(
      {
        id: updatedUser.id,
        firebase_uid: updatedUser.firebase_uid,
        role: updatedUser.role,
        name: updatedUser.name
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("User updated successfully:", updatedUser);

    res.json({
      success: true,
      user: updatedUser,
      token: token,
      needsName: false,
      isNewUser: false,
      message: "Profile updated successfully!"
    });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({
      success: false,
      message: "Server error: " + err.message,
    });
  }
});

module.exports = router;