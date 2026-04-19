const express = require("express");
const router = express.Router();

const jwt = require("jsonwebtoken");
const admin = require("../firebaseAdmin");
const db = require("../db");

const authMiddleware = require("../middlewares/authMiddleware");
// ❌ REMOVED: const { registerUser } = require("../controllers/authController");

/////////////////////////////////////////////////////////
// 🔥 FIREBASE LOGIN / CHECK USER (UPDATED)
/////////////////////////////////////////////////////////
router.post("/firebase", async (req, res) => {
  try {
    const { idToken, role: requestedRole, phone, name } = req.body;

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
      // New user - create record with name if provided
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
        [firebase_uid, name || null, email, cleanPhone, role, 1]
      );

      const [[newUser]] = await db.query(
        "SELECT * FROM users WHERE id = ?",
        [result.insertId]
      );
      
      user = newUser;
      
      // Check if name was provided during creation
      const hasValidName = user.name && 
        user.name.trim() !== "" && 
        user.name !== user.phone &&
        !user.name.startsWith("+") &&
        !/^[0-9]+$/.test(user.name);
      
      needsName = !hasValidName;
      
    } else {
      // Existing user
      user = rows[0];
      isNewUser = false;
      
      // 🔥 UPDATE NAME IF PROVIDED AND USER HAS NO VALID NAME
      if (name && (!user.name || user.name.trim() === "")) {
        const isValidName = name.trim().length >= 3 && !/^[0-9+]+$/.test(name);

        if (isValidName) {
          await db.query(
            "UPDATE users SET name = ?, updated_at = NOW() WHERE firebase_uid = ?",
            [name.trim(), firebase_uid]
          );

          user.name = name.trim();
          console.log("Name updated for existing user:", name.trim());
        }
      }
      
      // 🔥 SIMPLIFIED needsName LOGIC
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

// ❌ STEP 5: REGISTER API COMPLETELY REMOVED
// router.post("/register", ...) - DELETED

module.exports = router;