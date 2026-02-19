const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const admin = require("../firebaseAdmin");
const db = require("../db");

/* ================= GOOGLE LOGIN ================= */
router.post("/google", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "Token missing" });
    }

    // 1️⃣ Verify Firebase token
    const decoded = await admin.auth().verifyIdToken(idToken);
    const firebase_uid = decoded.uid;
    const email = decoded.email || "";

    // 2️⃣ Check user in DB
    const [rows] = await db.query(
      "SELECT role FROM users WHERE firebase_uid = ?",
      [firebase_uid]
    );

    // 🔥 DEFAULT ROLE MUST MATCH ENUM
    let role = "tenant";

    if (!rows.length) {
      // 3️⃣ Create user if not exists
      await db.query(
        "INSERT INTO users (firebase_uid, email, role) VALUES (?, ?, ?)",
        [firebase_uid, email, "tenant"]
      );
    } else {
      role = rows[0].role; // tenant | owner | admin
    }

    // 4️⃣ Issue backend JWT
    const token = jwt.sign(
      { firebase_uid, role },
      process.env.JWT_SECRET || "secret123",
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      role
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(401).json({ message: "Invalid token" });
  }
});

module.exports = router;
