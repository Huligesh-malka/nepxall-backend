const jwt = require("jsonwebtoken");
const admin = require("../firebaseAdmin");
const db = require("../db");

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    let firebaseUid;

    try {
      decoded = await admin.auth().verifyIdToken(token);
      firebaseUid = decoded.uid;
    } catch {
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
        firebaseUid = decoded.firebase_uid;
      } catch {
        return res.status(401).json({ message: "Invalid token" });
      }
    }

    const [rows] = await db.query(
      "SELECT * FROM users WHERE firebase_uid=? LIMIT 1",
      [firebaseUid]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];

    // 🔐 SAFE USER OBJECT
    req.user = {
      id: user.id,
      firebase_uid: user.firebase_uid,
      role: user.role,
      email: user.email,
      phone: user.phone,
      name: user.name
    };

    next();

  } catch (err) {
    console.error("❌ AUTH ERROR:", err);
    res.status(500).json({ message: "Auth failed" });
  }
};