// controllers/privateChatController.js
const db = require("../db");

/* =========================================================
   🧠 GET OR CREATE MYSQL USER FROM FIREBASE
========================================================= */
async function getMe(firebaseUser) {
  try {
    const { uid, name, email, phone_number } = firebaseUser;

    console.log("🔍 Looking up user with firebase_uid:", uid);

    let [rows] = await db.query(
      "SELECT id, name, email, role, firebase_uid FROM users WHERE firebase_uid=?",
      [uid]
    );

    if (rows.length === 0) {
      console.log("👤 Creating new user for firebase_uid:", uid);
      
      // Determine role - you might want to check if this is an owner signup
      const role = 'tenant'; // Default to tenant
      
      const [result] = await db.query(
        `INSERT INTO users (firebase_uid, name, email, phone, role)
         VALUES (?, ?, ?, ?, ?)`,
        [uid, name || null, email || null, phone_number || null, role]
      );

      const newUser = {
        id: result.insertId,
        name: name || (email ? email.split("@")[0] : "User"),
        firebase_uid: uid,
        role: role,
      };
      
      console.log("✅ Created new user:", newUser);
      return newUser;
    }

    const user = rows[0];
    user.name = user.name || (user.email ? user.email.split("@")[0] : "User");
    console.log("✅ Found existing user:", user);
    return user;
  } catch (err) {
    console.error("❌ Error in getMe:", err);
    throw err;
  }
}

/* =========================================================
   👤 GET LOGGED IN USER
========================================================= */
const getMeHandler = async (req, res) => {
  try {
    console.log("📡 getMeHandler called with user:", req.user?.uid);
    
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const me = await getMe(req.user);
    res.json(me);
  } catch (err) {
    console.error("❌ getMe error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📃 CHAT LIST
========================================================= */
const getMyChatList = async (req, res) => {
  try {
    console.log("📡 getMyChatList called");
    
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

    console.log(`📋 Found ${rows.length} conversations`);
    res.json(rows);
  } catch (err) {
    console.error("❌ getMyChatList error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   👤 GET OTHER USER
========================================================= */
const getUserById = async (req, res) => {
  try {
    console.log("📡 getUserById called for id:", req.params.id);
    
    const [rows] = await db.query(
      `SELECT id, name, firebase_uid, email, role 
       FROM users WHERE id = ?`,
      [req.params.id]
    );

    console.log("👤 Found user:", rows[0]);
    res.json(rows[0] || null);
  } catch (err) {
    console.error("❌ getUserById error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📥 GET MESSAGES
========================================================= */
const getPrivateMessages = async (req, res) => {
  try {
    console.log("📡 getPrivateMessages called for userId:", req.params.userId);
    
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

    console.log(`💬 Found ${rows.length} messages`);
    res.json(rows);
  } catch (err) {
    console.error("❌ getPrivateMessages error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📤 SEND MESSAGE
========================================================= */
const sendPrivateMessage = async (req, res) => {
  try {
    console.log("📡 sendPrivateMessage called with body:", req.body);
    
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

    // Get sender's firebase_uid
    const [senderRows] = await db.query(
      "SELECT firebase_uid FROM users WHERE id = ?",
      [me.id]
    );

    const messageData = {
      id: result.insertId,
      sender_id: me.id,
      receiver_id: parseInt(receiver_id),
      message,
      created_at: new Date(),
      is_read: false,
      sender_firebase_uid: senderRows[0]?.firebase_uid,
      receiver_firebase_uid: receiverRows[0]?.firebase_uid
    };

    console.log("✅ Message saved:", messageData);
    res.json(messageData);
  } catch (err) {
    console.error("❌ sendPrivateMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   ✏️ UPDATE MESSAGE
========================================================= */
const updatePrivateMessage = async (req, res) => {
  try {
    console.log("📡 updatePrivateMessage called for id:", req.params.id);
    
    const me = await getMe(req.user);

    await db.query(
      "UPDATE private_messages SET message = ? WHERE id = ? AND sender_id = ?",
      [req.body.message, req.params.id, me.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ updatePrivateMessage error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   🗑 DELETE MESSAGE
========================================================= */
const deletePrivateMessage = async (req, res) => {
  try {
    console.log("📡 deletePrivateMessage called for id:", req.params.id);
    
    await db.query("DELETE FROM private_messages WHERE id = ?", [
      req.params.id,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("❌ deletePrivateMessage error:", err);
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