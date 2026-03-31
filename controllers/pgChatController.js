const db = require("../db");

/* =========================================================
   🔐 CHECK PG ACCESS (OWNER OR ACTIVE TENANT)
========================================================= */
async function checkPgAccess(pgId, userId) {
  // Using a single query to check both tables efficiently
  const [[row]] = await db.query(
    `
    SELECT (
      EXISTS (SELECT 1 FROM pgs WHERE id = ? AND owner_id = ?)
      OR
      EXISTS (SELECT 1 FROM pg_users WHERE pg_id = ? AND user_id = ? AND status = 'ACTIVE')
    ) AS hasAccess
    `,
    [pgId, userId, pgId, userId]
  );

  return row.hasAccess === 1;
}

/* =========================================================
   📤 SEND MESSAGE
========================================================= */
exports.sendMessage = async (req, res) => {
  try {
    const { pg_id, message } = req.body;
    const userId = req.user.id;

    if (!pg_id || !message?.trim()) {
      return res.status(400).json({ message: "Message cannot be empty" });
    }

    /* 🔐 ACCESS CHECK */
    const hasAccess = await checkPgAccess(pg_id, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Not authorized for this PG group." });
    }

    /* 👤 GET ROLE */
    const [[roleRow]] = await db.query(
      `
      SELECT role FROM users WHERE id = ?
      `,
      [userId]
    );

    const senderRole = roleRow?.role || "tenant";

    /* 💾 SAVE MESSAGE */
    const [result] = await db.query(
      `
      INSERT INTO pg_messages (pg_id, sender_id, sender_role, message)
      VALUES (?, ?, ?, ?)
      `,
      [pg_id, userId, senderRole, message.trim()]
    );

    res.json({
      id: result.insertId,
      pg_id,
      sender_id: userId,
      sender_name: req.user.name,
      sender_role: senderRole,
      message: message.trim(),
      created_at: new Date(),
    });

  } catch (err) {
    console.error("PG Send Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📥 GET MESSAGES (PERSIST AFTER REFRESH ✅)
========================================================= */
/* =========================================================
   📥 GET MESSAGES (CORRECTED PERSISTENCE)
========================================================= */
exports.getMessages = async (req, res) => {
  try {
    const { pgId } = req.params;
    const userId = req.user.id; // Ensure this is correctly attached from auth middleware

    /* 🔐 ROBUST ACCESS CHECK */
    // This query checks if the user is the owner OR an active tenant in one go
    const [[access]] = await db.query(
      `
      SELECT 
        EXISTS (SELECT 1 FROM pgs WHERE id = ? AND owner_id = ?) AS isOwner,
        EXISTS (SELECT 1 FROM pg_users WHERE pg_id = ? AND user_id = ? AND status = 'ACTIVE') AS isTenant
      `,
      [pgId, userId, pgId, userId]
    );

    if (!access.isOwner && !access.isTenant) {
      return res.status(403).json({ message: "Access denied. You are not a member of this PG." });
    }

    /* 📜 LOAD PERSISTENT HISTORY */
    const [rows] = await db.query(
      `
      SELECT 
        m.id, 
        m.pg_id, 
        m.sender_id, 
        m.sender_role, 
        m.message, 
        m.created_at,
        u.name AS sender_name
      FROM pg_messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.pg_id = ?
      ORDER BY m.created_at ASC
      `,
      [pgId]
    );

    res.json(rows); // This sends the data that will persist on refresh
  } catch (err) {
    console.error("FETCH ERROR:", err);
    res.status(500).json({ message: "Error loading chat history" });
  }
};

/* =========================================================
   📝 UPDATE MESSAGE
========================================================= */
exports.updateMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = req.user.id;

    const [result] = await db.query(
      `
      UPDATE pg_messages m
      JOIN pgs p ON m.pg_id = p.id
      SET m.message = ?
      WHERE m.id = ?
      AND (m.sender_id = ? OR p.owner_id = ?)
      `,
      [message.trim(), id, userId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ message: "Update error" });
  }
};

/* =========================================================
   🗑️ DELETE MESSAGE
========================================================= */
exports.deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [result] = await db.query(
      `
      DELETE m FROM pg_messages m
      JOIN pgs p ON m.pg_id = p.id
      WHERE m.id = ?
      AND (m.sender_id = ? OR p.owner_id = ?)
      `,
      [id, userId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ message: "Delete error" });
  }
};
