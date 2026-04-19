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
  // Use a connection from the pool to handle transactions
  const connection = await db.getConnection();
  
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

    // 2. Format Phone Number (Standardize to 10 digits)
    const cleanPhone = firebase_phone ? firebase_phone.replace(/^\+91/, "").replace(/\D/g, "") : null;

    // Start Transaction to prevent duplicate users on slow network bursts
    await connection.beginTransaction();

    // 3. Check if user exists (Lock the row for update)
    const [rows] = await connection.query(
      "SELECT * FROM users WHERE firebase_uid = ? FOR UPDATE",
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

      // Update name if it was just provided in this request (Step 3 completion)
      // Checks if currently saved name is invalid (empty or just the phone number)
      const currentNameInvalid = !user.name || user.name.trim() === "" || /^[0-9+]+$/.test(user.name);
      
      if (providedName && providedName.trim().length >= 3 && currentNameInvalid) {
        await connection.query(
          "UPDATE users SET name = ?, updated_at = NOW() WHERE firebase_uid = ?",
          [providedName.trim(), firebase_uid]
        );
        user.name = providedName.trim();
      }

      // Sync missing phone/email if they exist in Firebase but not DB
      if (!user.phone && cleanPhone) {
        await connection.query("UPDATE users SET phone = ? WHERE id = ?", [cleanPhone, user.id]);
        user.phone = cleanPhone;
      }
      if (!user.email && email) {
        await connection.query("UPDATE users SET email = ? WHERE id = ?", [email, user.id]);
        user.email = email;
      }
    }

    await connection.commit();

    // 4. Final "Needs Name" Validation Logic
    // Returns true if the user still needs to provide a proper name string
    const hasValidName = 
      user.name && 
      user.name.trim().length >= 3 && 
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

    // 6. Return Structured Response
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
      message: needsName ? "Complete your profile" : "Authentication successful"
    });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error("🔥 Auth Logic Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server Error during Authentication",
      error: err.message
    });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;