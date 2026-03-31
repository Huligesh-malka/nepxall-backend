const db = require("../db");

/* ================= REGISTER USER ================= */
exports.registerUser = async (req, res) => {
  try {
    const { name, phone, role } = req.body;

    // 🔐 From Firebase middleware
    const firebase_uid = req.user.firebase_uid;

    /* ================= VALIDATION ================= */

    if (!firebase_uid) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Firebase UID missing",
      });
    }

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name and phone are required",
      });
    }

    // 📞 Phone validation
    if (!/^[0-9]{10,15}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Enter valid phone number",
      });
    }

    // 🔐 Role protection (VERY IMPORTANT)
    const allowedRoles = ["tenant", "owner"];
    const safeRole = allowedRoles.includes(role) ? role : "tenant";

    /* ================= CHECK EXISTING USER ================= */

    const [existing] = await db.query(
      "SELECT * FROM users WHERE firebase_uid = ?",
      [firebase_uid]
    );

    if (existing.length > 0) {
      return res.json({
        success: true,
        message: "User already registered ✅",
        user: existing[0],
      });
    }

    /* ================= CREATE USER ================= */

    const userData = {
      name,
      phone,
      role: safeRole,
      firebase_uid,
      email: req.user.email || null, // optional from Firebase
      mobile_verified: 1, // since Firebase verified
      owner_verification_status: safeRole === "owner" ? "pending" : null,
      created_at: new Date(),
    };

    const [result] = await db.query(
      "INSERT INTO users SET ?",
      userData
    );

    /* ================= FETCH CREATED USER ================= */

    const [newUser] = await db.query(
      "SELECT * FROM users WHERE id = ?",
      [result.insertId]
    );

    res.json({
      success: true,
      message: "User registered successfully ✅",
      user: newUser[0],
    });

  } catch (err) {
    console.error("Register error:", err);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};