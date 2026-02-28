const db = require("../db");

/* =========================================================
   🧠 GET OR CREATE MYSQL USER FROM FIREBASE
========================================================= */
async function getMe(firebaseUser) {
  const { uid, name, email, phone_number } = firebaseUser;

  let [rows] = await db.query(
    "SELECT id, name, email, role, firebase_uid FROM users WHERE firebase_uid=?",
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
      firebase_uid: uid,
      role: "tenant",
    };
  }

  const user = rows[0];
  user.name = user.name || (user.email ? user.email.split("@")[0] : "User");
  return user;
}

/* =========================================================
   👤 GET LOGGED IN USER
========================================================= */
const getMeHandler = async (req, res) => {
  try {
    const me = await getMe(req.user);
    res.json(me);
  } catch (err) {
    console.error("getMe error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📃 CHAT LIST
========================================================= */
const getMyChatList = async (req, res) => {
  try {
    const me = await getMe(req.user);

    const [rows] = await db.query(
      `
      SELECT 
        u.id,
        u.firebase_uid,
        COALESCE(u.name, SUBSTRING_INDEX(u.email,'@',1), 'User') AS name,
        pm.message AS last_message,
        pm.created_at AS last_time,
        CASE WHEN pm.sender_id = ? THEN 'me' ELSE 'other' END AS last_sender,
        (
          SELECT COUNT(*) 
          FROM private_messages 
          WHERE sender_id = u.id 
          AND receiver_id = ? 
          AND is_read = false
        ) AS unread_count
      FROM private_messages pm
      JOIN users u 
        ON u.id = CASE 
            WHEN pm.sender_id = ? THEN pm.receiver_id 
            ELSE pm.sender_id 
          END
      WHERE pm.id IN (
        SELECT MAX(id)
        FROM private_messages
        WHERE sender_id = ? OR receiver_id = ?
        GROUP BY LEAST(sender_id, receiver_id),
                 GREATEST(sender_id, receiver_id)
      )
      ORDER BY last_time DESC
      `,
      [me.id, me.id, me.id, me.id, me.id]
    );

    res.json(rows);
  } catch (err) {
    console.error("getMyChatList error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   👤 GET OTHER USER
========================================================= */
const getUserById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, firebase_uid, email, role 
       FROM users WHERE id = ?`,
      [req.params.id]
    );

    res.json(rows[0] || null);
  } catch (err) {
    console.error("getUserById error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📥 GET MESSAGES
========================================================= */
const getPrivateMessages = async (req, res) => {
  try {
    const me = await getMe(req.user);
    const otherId = Number(req.params.userId);

    // Mark messages as read when fetched
    await db.query(
      `UPDATE private_messages 
       SET is_read = true 
       WHERE sender_id = ? AND receiver_id = ? AND is_read = false`,
      [otherId, me.id]
    );

    const [rows] = await db.query(
      `
      SELECT *
      FROM private_messages
      WHERE 
        (sender_id = ? AND receiver_id = ?)
        OR
        (sender_id = ? AND receiver_id = ?)
      ORDER BY created_at ASC
      `,
      [me.id, otherId, otherId, me.id]
    );

    res.json(rows);
  } catch (err) {
    console.error("getPrivateMessages error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📤 SEND MESSAGE
========================================================= */
const sendPrivateMessage = async (req, res) => {
  try {
    const me = await getMe(req.user);
    const { receiver_id, message } = req.body;

    if (!receiver_id || !message) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const [result] = await db.query(
      `INSERT INTO private_messages 
       (sender_id, receiver_id, message, is_read, created_at)
       VALUES (?, ?, ?, false, NOW())`,
      [me.id, receiver_id, message]
    );

    // Get receiver's firebase_uid
    const [receiverRows] = await db.query(
      "SELECT firebase_uid FROM users WHERE id = ?",
      [receiver_id]
    );

    const messageData = {
      id: result.insertId,
      sender_id: me.id,
      receiver_id,
      message,
      created_at: new Date(),
      is_read: false,
      sender_firebase_uid: me.firebase_uid,
      receiver_firebase_uid: receiverRows[0]?.firebase_uid
    };

    res.json(messageData);
  } catch (err) {
    console.error("sendPrivateMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   ✏️ UPDATE MESSAGE
========================================================= */
const updatePrivateMessage = async (req, res) => {
  try {
    const me = await getMe(req.user);

    await db.query(
      "UPDATE private_messages SET message = ? WHERE id = ? AND sender_id = ?",
      [req.body.message, req.params.id, me.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("updatePrivateMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   🗑 DELETE MESSAGE
========================================================= */
const deletePrivateMessage = async (req, res) => {
  try {
    await db.query("DELETE FROM private_messages WHERE id = ?", [
      req.params.id,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("deletePrivateMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getMe: getMeHandler,
  getMyChatList,
  getUserById,
  getPrivateMessages,
  sendPrivateMessage,
  updatePrivateMessage,
  deletePrivateMessage,
};