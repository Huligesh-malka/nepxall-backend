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

    /* 1️⃣ VERIFY FIREBASE TOKEN */
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

    /* 2️⃣ CHECK USER */
    const [rows] = await db.query(
      "SELECT * FROM users WHERE firebase_uid = ? LIMIT 1",
      [firebase_uid]
    );

    let user;
    let role = "tenant";

    /* 🆕 NEW USER */
    if (!rows.length) {

      role = requestedRole || "tenant";

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

    /* ✅ EXISTING USER */
    else {
      user = rows[0];
      role = user.role;

      if (!user.phone && phone) {
        await db.query("UPDATE users SET phone=? WHERE id=?", [phone, user.id]);
      }

      if (!user.email && email) {
        await db.query("UPDATE users SET email=? WHERE id=?", [email, user.id]);
      }
    }

    /* 👑 AUTO OWNER UPGRADE */
    if (role !== "admin" && role !== "owner") {

      const [pgRows] = await db.query(
        "SELECT id FROM pgs WHERE owner_id = ? LIMIT 1",
        [user.id]
      );

      if (pgRows.length > 0) {
        role = "owner";

        await db.query(
          "UPDATE users SET role='owner' WHERE id=?",
          [user.id]
        );

        console.log("🎉 AUTO UPGRADED TO OWNER");
      }
    }

    /* 🔐 CREATE JWT */
    const token = jwt.sign(
      {
        id: user.id,
        firebase_uid,
        role
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      role,
      name: user.name
    });

  } catch (err) {
    console.error("❌ FIREBASE AUTH ERROR:", err);
    res.status(401).json({ message: "Invalid token" });
  }
});

module.exports = router;