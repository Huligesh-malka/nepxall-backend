const express = require("express");
const router = express.Router();

const jwt = require("jsonwebtoken");
const admin = require("../firebaseAdmin");
const db = require("../db");

const authMiddleware = require("../middleware/authMiddleware");
const { registerUser } = require("../controllers/authController");

/////////////////////////////////////////////////////////
// 🔥 FIREBASE LOGIN
/////////////////////////////////////////////////////////
router.post("/firebase", async (req, res) => {
  try {
    const { idToken, role: requestedRole } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "Token missing" });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);

    const firebase_uid = decoded.uid;
    const email = decoded.email || null;
    const phone = decoded.phone_number || null;

    const [rows] = await db.query(
      "SELECT * FROM users WHERE firebase_uid = ? LIMIT 1",
      [firebase_uid]
    );

    let user;
    let role = "tenant";

    if (!rows.length) {
      const allowedRoles = ["tenant", "owner", "vendor"];

      const safeRequestedRole = (requestedRole || "")
        .toLowerCase()
        .trim();

      role = allowedRoles.includes(safeRequestedRole)
        ? safeRequestedRole
        : "tenant";

      const [result] = await db.query(
        `INSERT INTO users
        (firebase_uid, name, email, phone, role, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())`,
        [firebase_uid, null, email, phone, role]
      );

      const [[newUser]] = await db.query(
        "SELECT * FROM users WHERE id = ?",
        [result.insertId]
      );

      user = newUser;
    } else {
      user = rows[0];
      role = user.role;

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

    const needsName =
      !user.name ||
      user.name.trim() === "" ||
      user.name.startsWith("+") ||
      /^[0-9]+$/.test(user.name);

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
      name: user.name,
      userId: user.id,
      needsName
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
// ✅ REGISTER NAME
/////////////////////////////////////////////////////////
router.post("/register", authMiddleware, registerUser);

module.exports = router;