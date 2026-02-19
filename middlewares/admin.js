// middlewares/admin.js
const db = require("../db");

module.exports = async (req, res, next) => {
  try {
    // 🔐 Auth must run first
    if (!req.user || !req.user.uid) {
      console.log("❌ AdminMiddleware: req.user missing");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const firebaseUid = req.user.uid;
    console.log("🛡️ AdminMiddleware UID:", firebaseUid);

    const [rows] = await db.query(
      "SELECT role FROM users WHERE firebase_uid = ? LIMIT 1",
      [firebaseUid]
    );

    console.log("📦 AdminMiddleware DB rows:", rows);

    if (!rows.length) {
      return res.status(403).json({ message: "User not found" });
    }

    if (rows[0].role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    next();
  } catch (err) {
    console.error("❌ Admin middleware error:", err);
    res.status(500).json({ message: "Admin verification failed" });
  }
};
