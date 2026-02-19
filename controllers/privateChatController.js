const db = require("../db");

/* =========================================================
   🧠 INTERNAL HELPER: GET OR CREATE MYSQL USER
========================================================= */
async function getMe(firebaseUser) {
  const { uid, name, email, phone_number } = firebaseUser;

  let [rows] = await db.query(
    "SELECT id, name, email, role FROM users WHERE firebase_uid=?",
    [uid]
  );

  if (rows.length === 0) {
    const [result] = await db.query(
      `INSERT INTO users (firebase_uid, name, email, phone, role)
       VALUES (?, ?, ?, ?, 'tenant')`,
      [uid, name || null, email || null, phone_number || null]
    );

    return { 
      id: result.insertId, 
      name: name || (email ? email.split("@")[0] : "User"), 
      role: "tenant" 
    };
  }

  const user = rows[0];
  user.name = user.name || (user.email ? user.email.split("@")[0] : "User");
  return user;
}

/* =========================================================
   📃 GET CHAT LIST (Fixes the 404 Error)
========================================================= */
exports.getMyChatList = async (req, res) => {
  try {
    const me = await getMe(req.user);

    const [rows] = await db.query(
      `
      SELECT 
        u.id,
        CASE 
          WHEN u.role = 'owner' THEN (SELECT pg_name FROM pgs WHERE owner_id = u.id LIMIT 1)
          ELSE COALESCE(u.name, SUBSTRING_INDEX(u.email, '@', 1), 'User')
        END AS name,
        pm.message AS last_message,
        pm.created_at AS last_time,
        CASE WHEN pm.sender_id = ? THEN 'me' ELSE 'other' END AS last_sender,
        (
          SELECT COUNT(*) FROM private_messages 
          WHERE sender_id = u.id AND receiver_id = ? AND is_read = 0 AND deleted_by_receiver = 0
        ) AS unread
      FROM private_messages pm
      JOIN users u ON u.id = CASE WHEN pm.sender_id = ? THEN pm.receiver_id ELSE pm.sender_id END
      WHERE pm.id IN (
        SELECT MAX(id) FROM private_messages 
        WHERE (sender_id = ? AND deleted_by_sender = 0) 
           OR (receiver_id = ? AND deleted_by_receiver = 0)
        GROUP BY LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id)
      )
      ORDER BY last_time DESC
      `,
      [me.id, me.id, me.id, me.id, me.id]
    );

    res.json(rows);
  } catch (err) {
    console.error("getMyChatList Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   👤 GET LOGGED-IN USER
========================================================= */
exports.getMe = async (req, res) => {
  try {
    const me = await getMe(req.user);
    res.json(me);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   👤 GET OTHER USER BY ID
========================================================= */
exports.getUserById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.firebase_uid,
        CASE 
          WHEN u.role = 'owner' THEN (SELECT pg_name FROM pgs WHERE owner_id = u.id LIMIT 1)
          ELSE COALESCE(u.name, SUBSTRING_INDEX(u.email,'@',1),'User')
        END AS name
      FROM users u WHERE u.id=?`,
      [req.params.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📤 SEND MESSAGE
========================================================= */
exports.sendPrivateMessage = async (req, res) => {
  try {
    const me = await getMe(req.user);
    const { receiver_id, message } = req.body;

    const [result] = await db.query(
      `INSERT INTO private_messages (sender_id, receiver_id, message) VALUES (?, ?, ?)`,
      [me.id, receiver_id, message.trim()]
    );

    res.json({
      id: result.insertId,
      sender_id: me.id,
      receiver_id,
      message: message.trim(),
      created_at: new Date(),
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📥 GET CONVERSATION
========================================================= */
exports.getPrivateMessages = async (req, res) => {
  try {
    const me = await getMe(req.user);
    const otherUserId = req.params.userId;

    // Mark messages as read when opening conversation
    await db.query(
      "UPDATE private_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?",
      [otherUserId, me.id]
    );

    const [rows] = await db.query(
      `SELECT pm.*, 
        CASE WHEN s.role = 'owner' THEN (SELECT pg_name FROM pgs WHERE owner_id = s.id LIMIT 1)
        ELSE COALESCE(s.name,'User') END AS sender_name
      FROM private_messages pm
      JOIN users s ON s.id = pm.sender_id
      WHERE (pm.sender_id=? AND pm.receiver_id=? AND pm.deleted_by_sender=0)
      OR (pm.sender_id=? AND pm.receiver_id=? AND pm.deleted_by_receiver=0)
      ORDER BY pm.created_at ASC`,
      [me.id, otherUserId, otherUserId, me.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📝 UPDATE / DELETE MESSAGE
========================================================= */
exports.updatePrivateMessage = async (req, res) => {
  try {
    const me = await getMe(req.user);
    const [result] = await db.query(
      "UPDATE private_messages SET message = ? WHERE id = ? AND sender_id = ?",
      [req.body.message.trim(), req.params.id, me.id]
    );
    res.json({ success: result.affectedRows > 0 });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.deletePrivateMessage = async (req, res) => {
  try {
    const me = await getMe(req.user);
    const { id } = req.params;
    const [[msg]] = await db.query("SELECT * FROM private_messages WHERE id=?", [id]);
    if (!msg) return res.status(404).json({ message: "Not found" });

    if (msg.sender_id === me.id) {
      await db.query("UPDATE private_messages SET deleted_by_sender=1 WHERE id=?", [id]);
    } else {
      await db.query("UPDATE private_messages SET deleted_by_receiver=1 WHERE id=?", [id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};