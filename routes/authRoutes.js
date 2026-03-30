const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const admin = require("../firebaseAdmin");
const db = require("../db");

router.post("/firebase", async (req, res) => {
  try {
    const { idToken, role: requestedRole } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "Token missing" });
    }

    /* =====================================================
       1️⃣ VERIFY FIREBASE TOKEN
    ===================================================== */
    const decoded = await admin.auth().verifyIdToken(idToken);

    const firebase_uid = decoded.uid;
    const email = decoded.email || null;
    const phone = decoded.phone_number || null;
    const name =
      decoded.name ||
      decoded.email ||
      decoded.phone_number ||
      "User";

    console.log("🔥 FIREBASE UID:", firebase_uid);

    /* =====================================================
       2️⃣ CHECK USER IN DB
    ===================================================== */
    const [rows] = await db.query(
      "SELECT * FROM users WHERE firebase_uid = ? LIMIT 1",
      [firebase_uid]
    );

    let user;
    let role = "tenant";

    /* =====================================================
       🆕 NEW USER (SECURE ROLE ASSIGNMENT)
    ===================================================== */
    if (!rows.length) {

      // ✅ SECURITY FIX: Only allow safe roles (NO ADMIN)
      const allowedRoles = ["tenant", "owner", "vendor"];

      role = allowedRoles.includes(requestedRole)
        ? requestedRole
        : "tenant";

      console.log("🛡️ Assigned safe role:", role);

      const [result] = await db.query(
        `INSERT INTO users
        (firebase_uid, name, email, phone, role, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())`,
        [firebase_uid, name, email, phone, role]
      );

      user = {
        id: result.insertId,
        name,
        email,
        phone,
        role
      };

      console.log("🆕 NEW USER CREATED");

    }

    /* =====================================================
       ✅ EXISTING USER
    ===================================================== */
    else {
      user = rows[0];
      role = user.role;

      console.log("👤 Existing user role:", role);

      if (!user.phone && phone) {
        await db.query("UPDATE users SET phone=? WHERE id=?", [phone, user.id]);
      }

      if (!user.email && email) {
        await db.query("UPDATE users SET email=? WHERE id=?", [email, user.id]);
      }
    }

    /* =====================================================
       🔒 SECURITY: REMOVE AUTO ROLE CHANGE
    ===================================================== */
    // ❌ OLD: Auto upgrade to owner (REMOVED)
    // ✅ Now role only changes via admin/manual process
    console.log("🔒 Role locked as:", role);

    /* =====================================================
       🔐 CREATE JWT (WITH ROLE)
    ===================================================== */
    const token = jwt.sign(
      {
        id: user.id,
        firebase_uid,
        role   // ✅ important
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    /* =====================================================
       ✅ RESPONSE
    ===================================================== */
    res.json({
      success: true,
      token,
      role,
      name: user.name,
      userId: user.id
    });

  } catch (err) {
    console.error("❌ FIREBASE AUTH ERROR:", err);
    res.status(401).json({ message: "Invalid token" });
  }
});

module.exports = router;