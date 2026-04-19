const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const admin = require("../firebaseAdmin");
const db = require("../db");

/**
 * @route   POST /api/auth/firebase
 * @desc    Verify Firebase ID Token, check/create user, and return JWT
 */
router.post("/firebase", async (req, res) => {
  try {
    const { idToken, role: requestedRole, phone, name } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, message: "Firebase ID Token missing" });
    }

    // 1. Verify Firebase Token
    const decoded = await admin.auth().verifyIdToken(idToken);
    const firebase_uid = decoded.uid;
    const email = decoded.email || null;
    const firebase_phone = decoded.phone_number || phone || null;

    // 2. Format Phone Number (Remove +91 and non-digits)
    const cleanPhone = firebase_phone ? firebase_phone.replace(/^\+91/, "").replace(/\D/g, "") : null;

    // 3. Check if user exists in DB
    const [rows] = await db.query(
      "SELECT * FROM users WHERE firebase_uid = ? LIMIT 1",
      [firebase_uid]
    );

    let user;
    let isNewUser = false;

    if (rows.length === 0) {
      // --- NEW USER FLOW ---
      console.log("New user detected. Creating database record...");
      isNewUser = true;

      const allowedRoles = ["tenant", "owner", "vendor"];
      const safeRole = allowedRoles.includes(requestedRole) ? requestedRole : "tenant";

      const [result] = await db.query(
        `INSERT INTO users 
         (firebase_uid, name, email, phone, role, mobile_verified, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [firebase_uid, name || null, email, cleanPhone, safeRole]
      );

      const [[newUser]] = await db.query("SELECT * FROM users WHERE id = ?", [result.insertId]);
      user = newUser;
    } else {
      // --- EXISTING USER FLOW ---
      user = rows[0];
      isNewUser = false;

      // Update name if it was just provided in this request (Step 3 completion)
      if (name && name.trim() !== "" && (!user.name || user.name === user.phone)) {
        const isValidName = name.trim().length >= 3 && !/^[0-9+]+$/.test(name);
        if (isValidName) {
          await db.query(
            "UPDATE users SET name = ?, updated_at = NOW() WHERE firebase_uid = ?",
            [name.trim(), firebase_uid]
          );
          user.name = name.trim();
        }
      }

      // Sync missing phone/email from Firebase if local DB is empty
      if (!user.phone && cleanPhone) {
        await db.query("UPDATE users SET phone = ? WHERE id = ?", [cleanPhone, user.id]);
        user.phone = cleanPhone;
      }
    }

    // 4. Strict "Needs Name" Validation
    // Checks if name is null, empty, or just a phone number (common Firebase default)
    const hasValidName = 
      user.name && 
      user.name.trim() !== "" && 
      user.name !== user.phone &&
      !/^[0-9+]+$/.test(user.name);

    const needsName = !hasValidName;

    // 5. Generate Application JWT
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

    // 6. Response
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
      needsName: needsName, // Critical for frontend navigation
      isNewUser: isNewUser,
      message: needsName ? "Please enter your name to continue" : "Welcome back!"
    });

  } catch (err) {
    console.error("🔥 Firebase Auth Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error during Authentication",
      error: err.message
    });
  }
});

module.exports = router;