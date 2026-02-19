const admin = require("firebase-admin");
const db = require("../db");

module.exports = async (req, res, next) => {
  try {
    /* ===============================
       ✅ CHECK TOKEN
    =============================== */
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    /* ===============================
       ✅ VERIFY FIREBASE TOKEN
    =============================== */
    const decoded = await admin.auth().verifyIdToken(token);

    const firebaseUid = decoded.uid;
    const email = decoded.email || null;
    const name =
      decoded.name ||
      decoded.email ||
      decoded.phone_number ||
      "User";

    const phone = decoded.phone_number || null;

    console.log("🔥 TOKEN UID:", firebaseUid);

    /* ===============================
       ✅ GET USER FROM MYSQL
    =============================== */
    const [rows] = await db.query(
      "SELECT * FROM users WHERE firebase_uid = ? LIMIT 1",
      [firebaseUid]
    );

    let user;

    /* ===============================
       🆕 CREATE USER (FIRST LOGIN)
    =============================== */
    if (rows.length === 0) {
      const [result] = await db.query(
        `INSERT INTO users 
        (firebase_uid, name, email, phone, role, created_at)
        VALUES (?, ?, ?, ?, 'tenant', NOW())`,
        [firebaseUid, name, email, phone]
      );

      user = {
        id: result.insertId,
        firebase_uid: firebaseUid,
        name,
        email,
        phone,
        role: "tenant"
      };

      console.log("🆕 NEW USER CREATED:", user);
    } else {
      user = rows[0];
      console.log("✅ EXISTING USER:", user);
    }

    /* ===============================
       🔥 AUTO OWNER UPGRADE LOGIC
       if user has at least 1 PG → owner
    =============================== */
    const [pgRows] = await db.query(
      "SELECT id FROM pgs WHERE owner_id = ? LIMIT 1",
      [user.id]
    );

    if (pgRows.length && user.role !== "owner") {
      await db.query(
        "UPDATE users SET role = 'owner' WHERE id = ?",
        [user.id]
      );

      user.role = "owner";

      console.log("🎉 AUTO UPGRADED TO OWNER");
    }

    /* ===============================
       ✅ ATTACH USER TO REQUEST
    =============================== */
    req.user = {
      uid: firebaseUid,
      mysqlId: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      phone: user.phone
    };

    console.log("🎯 REQ.USER:", req.user);

    next();

  } catch (err) {
    console.error("❌ AUTH ERROR:", err);
    return res.status(401).json({
      message: "Invalid or expired token"
    });
  }
};
