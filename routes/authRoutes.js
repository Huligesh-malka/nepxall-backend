const express = require("express");
const router = express.Router();

const jwt = require("jsonwebtoken");
const admin = require("../firebaseAdmin");
const db = require("../db");

const authMiddleware = require("../middlewares/authMiddleware");
const { registerUser } = require("../controllers/authController");

/////////////////////////////////////////////////////////
// 🔥 FIREBASE LOGIN / CHECK USER (FIXED VERSION)
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

    const cleanPhone = firebase_phone
      ? firebase_phone.replace(/^\+91/, "").replace(/\D/g, "")
      : null;

    //////////////////////////////////////////////////////
    // 🔍 CHECK USER BY FIREBASE UID
    //////////////////////////////////////////////////////
    const [rows] = await db.query(
      "SELECT * FROM users WHERE firebase_uid = ? LIMIT 1",
      [firebase_uid]
    );

    let user;
    let needsName = true;
    let isNewUser = false;

    //////////////////////////////////////////////////////
    // ❌ NO USER WITH FIREBASE UID
    //////////////////////////////////////////////////////
    if (!rows.length) {
      console.log("No firebase user found, checking phone...");

      //////////////////////////////////////////////////////
      // 🔥 CHECK USER BY PHONE (IMPORTANT FIX)
      //////////////////////////////////////////////////////
      const [[phoneUser]] = await db.query(
        "SELECT * FROM users WHERE phone = ? LIMIT 1",
        [cleanPhone]
      );

      if (phoneUser) {
        console.log("🔥 Existing phone user found → linking account");

        // ✅ UPDATE existing user instead of insert
        await db.query(
          `UPDATE users 
           SET firebase_uid = ?, mobile_verified = 1 
           WHERE id = ?`,
          [firebase_uid, phoneUser.id]
        );

        // ✅ LINK PGs to this owner
        await db.query(
          `UPDATE pgs 
           SET owner_id = ? 
           WHERE contact_phone = ?`,
          [phoneUser.id, cleanPhone]
        );

        user = {
          ...phoneUser,
          firebase_uid
        };

        needsName = !user.name;
        isNewUser = false;

      } else {
        //////////////////////////////////////////////////////
        // 🆕 NEW USER INSERT
        //////////////////////////////////////////////////////
        console.log("Creating new user record");

        const allowedRoles = ["tenant", "owner", "vendor"];
        const safeRequestedRole = (requestedRole || "").toLowerCase().trim();
        const role = allowedRoles.includes(safeRequestedRole) ? safeRequestedRole : "tenant";

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
        needsName = true;
        isNewUser = true;
      }

    } else {
      //////////////////////////////////////////////////////
      // ✅ EXISTING USER (firebase_uid found)
      //////////////////////////////////////////////////////
      user = rows[0];
      isNewUser = false;

      const hasValidName = user.name && 
        user.name.trim() !== "" && 
        user.name !== user.phone &&
        !user.name.startsWith("+") &&
        !/^[0-9]+$/.test(user.name);

      needsName = !hasValidName;

      console.log("Existing user found");

      // Update missing phone
      if (!user.phone && cleanPhone) {
        await db.query(
          "UPDATE users SET phone = ? WHERE id = ?",
          [cleanPhone, user.id]
        );
        user.phone = cleanPhone;
      }

      // Update missing email
      if (!user.email && email) {
        await db.query(
          "UPDATE users SET email = ? WHERE id = ?",
          [email, user.id]
        );
        user.email = email;
      }
    }

    //////////////////////////////////////////////////////
    // 🔐 GENERATE TOKEN
    //////////////////////////////////////////////////////
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

    //////////////////////////////////////////////////////
    // ✅ RESPONSE
    //////////////////////////////////////////////////////
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
      needsName,
      isNewUser,
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
// REGISTER API (UNCHANGED)
/////////////////////////////////////////////////////////
router.post("/register", authMiddleware, registerUser);

module.exports = router;