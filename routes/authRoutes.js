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

    // ❌ DO NOT AUTO SET NAME
    const name = null;

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
       🆕 NEW USER
    ===================================================== */
    if (!rows.length) {

      const allowedRoles = ["tenant", "owner", "vendor"];

      const safeRequestedRole = (requestedRole || "")
        .toLowerCase()
        .trim();

      role = allowedRoles.includes(safeRequestedRole)
        ? safeRequestedRole
        : "tenant";

      console.log("🛡️ Assigned safe role:", role);

      const [result] = await db.query(
        `INSERT INTO users
        (firebase_uid, name, email, phone, role, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          firebase_uid,
          null,      // ✅ ALWAYS NULL
          email,
          phone,
          role
        ]
      );

      const [[newUser]] = await db.query(
        "SELECT * FROM users WHERE id = ?",
        [result.insertId]
      );

      user = newUser;

      console.log("🆕 NEW USER CREATED");
    }

    /* =====================================================
       ✅ EXISTING USER
    ===================================================== */
    else {
      user = rows[0];
      role = user.role;

      console.log("👤 Existing user role:", role);

      // update missing fields only
      if (!user.phone && phone) {
        await db.query(
          "UPDATE users SET phone=? WHERE id=?",
          [phone, user.id]
        );
      }

      if (!user.email && email) {
        await db.query(
          "UPDATE users SET email=? WHERE id=?",
          [email, user.id]
        );
      }
    }

    /* =====================================================
       🔥 CHECK IF NAME REQUIRED
    ===================================================== */
    const needsName =
      !user.name ||
      user.name.trim() === "" ||
      user.name.startsWith("+") ||
      /^[0-9]+$/.test(user.name);

    /* =====================================================
       🔐 CREATE JWT
    ===================================================== */
    const token = jwt.sign(
      {
        id: user.id,
        firebase_uid,
        role
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
      userId: user.id,
      needsName // 🔥 IMPORTANT
    });

  } catch (err) {
    console.error("❌ FIREBASE AUTH ERROR:", err);
    res.status(401).json({ message: "Invalid token" });
  }
});

module.exports = router;