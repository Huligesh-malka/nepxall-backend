const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const db = require("../db");

module.exports = async (req, res, next) => {
  try {
    /* ================= TOKEN CHECK ================= */
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    let firebaseUid = null;
    let decoded = null;

    /* =====================================================
       1️⃣ TRY FIREBASE TOKEN
    ===================================================== */
    try {
      decoded = await admin.auth().verifyIdToken(token);

      firebaseUid = decoded.uid;

      console.log("🔥 FIREBASE UID:", firebaseUid);

    } catch (fbError) {
      console.log("⚠️ Not Firebase token → trying JWT");
    }

    /* =====================================================
       2️⃣ TRY CUSTOM JWT
    ===================================================== */
    if (!firebaseUid) {
      try {
        const jwtDecoded = jwt.verify(token, process.env.JWT_SECRET);

        firebaseUid = jwtDecoded.firebase_uid;

        console.log("🔑 JWT USER:", jwtDecoded.id);

      } catch (jwtError) {
        console.error("❌ AUTH ERROR:", jwtError.message);
        return res.status(401).json({ message: "Invalid token" });
      }
    }

    /* =====================================================
       3️⃣ GET FIREBASE USER DATA (IF AVAILABLE)
    ===================================================== */
    let email = decoded?.email || null;
    let phone = decoded?.phone_number || null;
    let name =
      decoded?.name ||
      decoded?.email ||
      decoded?.phone_number ||
      "User";

    /* =====================================================
       4️⃣ FIND USER IN DB
    ===================================================== */
    const [rows] = await db.query(
      `SELECT * FROM users WHERE firebase_uid = ? LIMIT 1`,
      [firebaseUid]
    );

    let user;

    /* ================= FIRST LOGIN ================= */
    if (rows.length === 0) {

      const requestedRole = req.body?.role || "tenant";

      const [result] = await db.query(
        `INSERT INTO users
        (firebase_uid, name, email, phone, role, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())`,
        [firebaseUid, name, email, phone, requestedRole]
      );

      user = {
        id: result.insertId,
        firebase_uid: firebaseUid,
        name,
        email,
        phone,
        role: requestedRole
      };

      console.log("🆕 NEW USER CREATED:", user);

    } else {
      user = rows[0];

      /* 🔄 UPDATE EMAIL / PHONE IF EMPTY */
      if (!user.phone && phone) {
        await db.query(`UPDATE users SET phone=? WHERE id=?`, [phone, user.id]);
        user.phone = phone;
      }

      if (!user.email && email) {
        await db.query(`UPDATE users SET email=? WHERE id=?`, [email, user.id]);
        user.email = email;
      }

      console.log("✅ EXISTING USER:", user.id);
    }

    /* =====================================================
       👑 AUTO OWNER UPGRADE
    ===================================================== */
    if (user.role !== "owner" && user.role !== "admin") {

      const [pgRows] = await db.query(
        `SELECT id FROM pgs WHERE owner_id=? LIMIT 1`,
        [user.id]
      );

      if (pgRows.length > 0) {
        await db.query(
          `UPDATE users SET role='owner' WHERE id=?`,
          [user.id]
        );

        user.role = "owner";

        console.log("🎉 AUTO UPGRADED TO OWNER");
      }
    }

    /* =====================================================
       ✅ ATTACH USER TO REQUEST
    ===================================================== */
    req.user = {
      firebaseUid,
      mysqlId: user.id,
      role: user.role,
      email: user.email,
      phone: user.phone,
      name: user.name
    };

    next();

  } catch (err) {
    console.error("❌ AUTH ERROR:", err.message);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};