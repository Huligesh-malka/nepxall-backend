const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const db = require("../db");

module.exports = async (req, res, next) => {
  try {
    /* ================= TOKEN CHECK ================= */
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    let firebaseUid = null;
    let userIdFromJWT = null;
    let decodedFirebase = null;
    let tokenSource = null;

    /* =====================================================
       1️⃣ TRY FIREBASE TOKEN
    ===================================================== */
    try {
      if (admin.apps.length) {
        decodedFirebase = await admin.auth().verifyIdToken(token);
        firebaseUid = decodedFirebase.uid;
        tokenSource = "firebase";
      }
    } catch (err) {
      // silently move to JWT
    }

    /* =====================================================
       2️⃣ TRY CUSTOM JWT
    ===================================================== */
    if (!firebaseUid) {
      try {
        const decodedJWT = jwt.verify(token, process.env.JWT_SECRET);

        userIdFromJWT = decodedJWT.id;
        firebaseUid = decodedJWT.firebase_uid || null;
        tokenSource = "jwt";

      } catch (jwtError) {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired token"
        });
      }
    }

    /* =====================================================
       3️⃣ FIND USER IN DB
    ===================================================== */

    let user;

    // 🔥 LOGIN VIA CUSTOM JWT (ADMIN / EMAIL LOGIN)
    if (userIdFromJWT) {
      const [rows] = await db.query(
        `SELECT * FROM users WHERE id = ? LIMIT 1`,
        [userIdFromJWT]
      );

      if (!rows.length) {
        return res.status(401).json({ success: false, message: "User not found" });
      }

      user = rows[0];
    }

    // 🔥 LOGIN VIA FIREBASE
    else if (firebaseUid) {
      const [rows] = await db.query(
        `SELECT * FROM users WHERE firebase_uid = ? LIMIT 1`,
        [firebaseUid]
      );

      if (rows.length === 0) {
        // ✅ create tenant by default
        const email = decodedFirebase?.email || null;
        const phone = decodedFirebase?.phone_number || null;
        const name = decodedFirebase?.name || email || phone || "User";

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

      } else {
        user = rows[0];
      }
    }

    if (!user) {
      return res.status(401).json({ success: false, message: "Authentication failed" });
    }

    /* =====================================================
       👑 AUTO OWNER UPGRADE
    ===================================================== */
    if (user.role === "tenant") {
      const [pgRows] = await db.query(
        `SELECT id FROM pgs WHERE owner_id=? LIMIT 1`,
        [user.id]
      );

      if (pgRows.length > 0) {
        await db.query(`UPDATE users SET role='owner' WHERE id=?`, [user.id]);
        user.role = "owner";
      }
    }

    /* =====================================================
       ✅ ATTACH USER TO REQUEST
    ===================================================== */
    req.user = {
      mysqlId: user.id,
      firebaseUid: user.firebase_uid || null,
      role: user.role,
      email: user.email,
      name: user.name,
      phone: user.phone
    };

    next();

  } catch (err) {
    console.error("AUTH ERROR:", err.message);

    res.status(401).json({
      success: false,
      message: "Authentication failed"
    });
  }
};