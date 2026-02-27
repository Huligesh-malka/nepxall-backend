const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const db = require("../db");

module.exports = async (req, res, next) => {
  try {
    /* ================= TOKEN CHECK ================= */
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ No token provided in request");
      return res.status(401).json({ 
        success: false,
        message: "No token provided" 
      });
    }

    const token = authHeader.split(" ")[1];
    console.log("🔑 Token received (first 30 chars):", token.substring(0, 30) + "...");

    let firebaseUid = null;
    let decoded = null;
    let tokenSource = null;

    /* =====================================================
       1️⃣ TRY FIREBASE TOKEN
    ===================================================== */
    try {
      // Check if Firebase Admin is initialized
      if (!admin.apps.length) {
        console.error("❌ Firebase Admin not initialized!");
        return res.status(500).json({ 
          success: false,
          message: "Firebase configuration error" 
        });
      }

      console.log("🔍 Attempting Firebase token verification...");
      decoded = await admin.auth().verifyIdToken(token);
      
      firebaseUid = decoded.uid;
      tokenSource = "firebase";
      
      console.log("✅ Firebase token verified successfully");
      console.log("🔥 Firebase UID:", firebaseUid);
      console.log("📧 Email:", decoded.email || 'N/A');
      console.log("📱 Phone:", decoded.phone_number || 'N/A');
      
    } catch (fbError) {
      console.log("⚠️ Firebase token verification failed:", fbError.code || fbError.message);
      console.log("Will try JWT verification...");
    }

    /* =====================================================
       2️⃣ TRY CUSTOM JWT
    ===================================================== */
    if (!firebaseUid) {
      try {
        console.log("🔍 Attempting JWT verification...");
        const jwtDecoded = jwt.verify(token, process.env.JWT_SECRET);
        
        firebaseUid = jwtDecoded.firebase_uid;
        tokenSource = "jwt";
        
        console.log("✅ JWT verified successfully");
        console.log("🔑 JWT User ID:", jwtDecoded.id);
        console.log("🔥 Firebase UID from JWT:", firebaseUid);

      } catch (jwtError) {
        console.error("❌ JWT verification failed:", jwtError.message);
        
        // Specific JWT error messages
        if (jwtError.name === 'TokenExpiredError') {
          return res.status(401).json({ 
            success: false,
            message: "Token expired",
            error: "Please login again"
          });
        } else if (jwtError.name === 'JsonWebTokenError') {
          return res.status(401).json({ 
            success: false,
            message: "Invalid token",
            error: "Token malformed"
          });
        }
        
        return res.status(401).json({ 
          success: false,
          message: "Invalid token",
          error: jwtError.message
        });
      }
    }

    if (!firebaseUid) {
      console.error("❌ No valid Firebase UID found after both verification attempts");
      return res.status(401).json({ 
        success: false,
        message: "Could not authenticate user" 
      });
    }

    /* =====================================================
       3️⃣ GET USER DATA FROM TOKEN
    ===================================================== */
    let email = decoded?.email || null;
    let phone = decoded?.phone_number || null;
    let name = decoded?.name || decoded?.email || decoded?.phone_number || "User";

    /* =====================================================
       4️⃣ FIND USER IN DB
    ===================================================== */
    console.log("🔍 Looking up user in database with firebase_uid:", firebaseUid);
    
    const [rows] = await db.query(
      `SELECT * FROM users WHERE firebase_uid = ? LIMIT 1`,
      [firebaseUid]
    );

    let user;

    /* ================= FIRST LOGIN ================= */
    if (rows.length === 0) {
      console.log("🆕 New user detected - creating account");

      const requestedRole = req.body?.role || "tenant";
      console.log("📝 Requested role:", requestedRole);

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

      console.log("✅ New user created with ID:", result.insertId);

    } else {
      user = rows[0];
      console.log("✅ Existing user found with ID:", user.id);
      console.log("Current role:", user.role);

      /* 🔄 UPDATE EMAIL / PHONE IF EMPTY */
      let needsUpdate = false;
      
      if (!user.phone && phone) {
        user.phone = phone;
        needsUpdate = true;
        console.log("📱 Will update phone");
      }

      if (!user.email && email) {
        user.email = email;
        needsUpdate = true;
        console.log("📧 Will update email");
      }

      if (needsUpdate) {
        await db.query(
          `UPDATE users SET phone=?, email=? WHERE id=?`, 
          [user.phone, user.email, user.id]
        );
        console.log("✅ User updated successfully");
      }
    }

    /* =====================================================
       👑 AUTO OWNER UPGRADE
    ===================================================== */
    if (user.role !== "owner" && user.role !== "admin") {
      console.log("🔍 Checking if user should be upgraded to owner...");
      
      const [pgRows] = await db.query(
        `SELECT id FROM pgs WHERE owner_id=? LIMIT 1`,
        [user.id]
      );

      if (pgRows.length > 0) {
        console.log("🏠 User owns PGs - upgrading to owner");
        
        await db.query(
          `UPDATE users SET role='owner' WHERE id=?`,
          [user.id]
        );

        user.role = "owner";
        console.log("🎉 User upgraded to owner");
      } else {
        console.log("👤 User remains as:", user.role);
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

    console.log("✅ Authentication successful for user:", user.id);
    console.log("📊 Final user data:", {
      id: user.id,
      role: user.role,
      email: user.email
    });

    next();

  } catch (err) {
    console.error("❌ AUTH MIDDLEWARE ERROR:", err);
    console.error("Error stack:", err.stack);
    
    // Database connection errors
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      return res.status(503).json({ 
        success: false,
        message: "Database connection lost",
        error: "Service temporarily unavailable"
      });
    }
    
    // Default error response
    res.status(401).json({ 
      success: false,
      message: "Authentication failed",
      error: process.env.NODE_ENV === 'development' ? err.message : "Invalid credentials"
    });
  }
};