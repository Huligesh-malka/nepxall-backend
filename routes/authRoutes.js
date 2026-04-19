const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const admin = require("../firebaseAdmin");
const db = require("../db");

/**
 * @route   POST /api/auth/firebase
 * @desc    Verify Firebase ID Token, check/create/update user, and return JWT
 */
router.post("/firebase", async (req, res) => {
  let connection;
  
  try {
    const { idToken, role: requestedRole, phone, name: providedName } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, message: "Firebase ID Token missing" });
    }

    // 1. Verify Firebase Token
    const decoded = await admin.auth().verifyIdToken(idToken);
    const firebase_uid = decoded.uid;
    const email = decoded.email || null;
    const firebase_phone = decoded.phone_number || phone || null;
    const cleanPhone = firebase_phone ? firebase_phone.replace(/^\+91/, "").replace(/\D/g, "") : null;

    // Get connection from pool
    connection = await db.getConnection();

    // 2. Check if user exists
    const [rows] = await connection.query(
      "SELECT * FROM users WHERE firebase_uid = ? LIMIT 1",
      [firebase_uid]
    );

    let user;
    let isNewUser = false;

    if (rows.length === 0) {
      // --- NEW USER FLOW ---
      isNewUser = true;
      const allowedRoles = ["tenant", "owner", "vendor"];
      const safeRole = allowedRoles.includes(requestedRole) ? requestedRole : "tenant";

      const [result] = await connection.query(
        `INSERT INTO users 
         (firebase_uid, name, email, phone, role, mobile_verified, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [firebase_uid, providedName || null, email, cleanPhone, safeRole]
      );

      const [[newUser]] = await connection.query("SELECT * FROM users WHERE id = ?", [result.insertId]);
      user = newUser;
    } else {
      // --- EXISTING USER FLOW ---
      user = rows[0];

      // 🔥 FIX: Update name if provided and the current name is missing or invalid
      // This is what solves the "Failed to save profile" loop
      if (providedName && providedName.trim().length >= 3) {
        await connection.query(
          "UPDATE users SET name = ?, updated_at = NOW() WHERE firebase_uid = ?",
          [providedName.trim(), firebase_uid]
        );
        user.name = providedName.trim(); // Update local object for JWT and Response
      }

      // Sync missing phone/email
      if (!user.phone && cleanPhone) {
        await connection.query("UPDATE users SET phone = ? WHERE firebase_uid = ?", [cleanPhone, firebase_uid]);
        user.phone = cleanPhone;
      }
    }

    // 3. Needs Name Validation
    // A valid name must exist, be >= 3 chars, and NOT be a phone number
    const isNameValid = user.name && 
                        user.name.trim().length >= 3 && 
                        !/^[0-9+ ]+$/.test(user.name);
    
    const needsName = !isNameValid;

    // 4. Generate Application JWT
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

    // 5. Success Response
    return res.json({
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
      needsName: needsName,
      isNewUser: isNewUser,
      message: needsName ? "Please enter your name" : "Welcome back!"
    });

  } catch (err) {
    console.error("🔥 Auth Backend Error:", err);
    return res.status(500).json({
      success: false,
      message: "Database error during profile save",
      error: err.message
    });
  } finally {
    if (connection) connection.release(); // Always release connection back to pool
  }
});

module.exports = router;