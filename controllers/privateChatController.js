const db = require("../db");

/* =========================================================
   🧠 GET OR CREATE MYSQL USER FROM FIREBASE
========================================================= */
async function getMe(firebaseUser) {
  const uid = firebaseUser.uid || firebaseUser.firebaseUid;
  const name = firebaseUser.name || "User";
  const email = firebaseUser.email || null;
  const phone_number = firebaseUser.phone_number || firebaseUser.phone || null;

  if (firebaseUser.mysqlId) {
    return {
      id: firebaseUser.mysqlId,
      name,
      email,
      role: firebaseUser.role
    };
  }

  if (!uid) throw new Error("Firebase UID missing");

  let [rows] = await db.query(
    "SELECT id, name, email, role FROM users WHERE firebase_uid = ? LIMIT 1",
    [uid]
  );

  if (rows.length) return rows[0];

  if (phone_number) {
    [rows] = await db.query(
      "SELECT id, name, email, role FROM users WHERE phone = ? LIMIT 1",
      [phone_number]
    );

    if (rows.length) {
      await db.query(
        "UPDATE users SET firebase_uid = ? WHERE id = ?",
        [uid, rows[0].id]
      );
      return rows[0];
    }
  }

  const [result] = await db.query(
    `INSERT INTO users (firebase_uid, name, email, phone, role)
     VALUES (?, ?, ?, ?, 'tenant')`,
    [uid, name, email, phone_number]
  );

  return {
    id: result.insertId,
    name,
    role: "tenant"
  };
}

/* ========================================================= */
exports.loadMe = async (req, res, next) => {
  try {
    if (!req.me) req.me = await getMe(req.user);
    next();
  } catch (err) {
    console.error("Load me error:", err);
    res.status(500).json({ message: "Auth error" });
  }
};

/* ========================================================= */
exports.getMe = (req, res) => res.json(req.me);

/* =========================================================
   📃 CHAT LIST (PG BASED)
========================================================= */
exports.getMyChatList = async (req, res) => {
  try {
    const me = req.me;

    const [rows] = await db.query(
      `
      SELECT DISTINCT
        u.id,
        u.firebase_uid,
        u.name as user_name,
        p.id AS pg_id,
        p.pg_name,
        CASE
          WHEN ? = 'owner' THEN u.name
          ELSE p.pg_name
        END AS display_name,
        (
          SELECT message 
          FROM private_messages 
          WHERE ((sender_id = ? AND receiver_id = u.id) OR (sender_id = u.id AND receiver_id = ?))
          AND pg_id = p.id
          ORDER BY created_at DESC 
          LIMIT 1
        ) AS last_message,
        (
          SELECT created_at 
          FROM private_messages 
          WHERE ((sender_id = ? AND receiver_id = u.id) OR (sender_id = u.id AND receiver_id = ?))
          AND pg_id = p.id
          ORDER BY created_at DESC 
          LIMIT 1
        ) AS last_time,
        (
          SELECT COUNT(*) 
          FROM private_messages 
          WHERE sender_id = u.id 
          AND receiver_id = ? 
          AND pg_id = p.id 
          AND is_read = 0
        ) AS unread_count,
        (
          SELECT sender_id 
          FROM private_messages 
          WHERE ((sender_id = ? AND receiver_id = u.id) OR (sender_id = u.id AND receiver_id = ?))
          AND pg_id = p.id
          ORDER BY created_at DESC 
          LIMIT 1
        ) AS last_sender_id
      FROM users u
      JOIN bookings b ON (b.user_id = u.id OR b.owner_id = u.id)
      JOIN pgs p ON p.id = b.pg_id
      WHERE (b.user_id = ? OR b.owner_id = ?)
      AND u.id != ?
      AND b.status IN ('confirmed', 'active', 'completed')
      ORDER BY last_time DESC
      `,
      [me.role, me.id, me.id, me.id, me.id, me.id, me.id, me.id, me.id, me.id, me.id]
    );

    const formattedRows = rows.map(row => ({
      id: row.id,
      firebase_uid: row.firebase_uid,
      name: row.display_name,
      pg_id: row.pg_id,
      pg_name: row.pg_name,
      last_message: row.last_message || "No messages yet",
      last_time: row.last_time,
      unread: row.unread_count || 0,
      last_sender: row.last_sender_id === me.id ? "me" : "other"
    }));

    res.json(formattedRows);
  } catch (err) {
    console.error("Chat list error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   👤 GET USER + PG INFO
========================================================= */
exports.getUserById = async (req, res) => {
  try {
    const me = req.me;
    const otherId = Number(req.params.id);
    const pgId = req.query.pgId ? Number(req.query.pgId) : null;

    console.log("Getting user by ID:", { meId: me.id, otherId, pgId });

    let query = `
      SELECT 
        u.id,
        u.name,
        u.role,
        p.id AS pg_id,
        p.pg_name
      FROM users u
      JOIN bookings b ON (b.user_id = u.id OR b.owner_id = u.id)
      JOIN pgs p ON p.id = b.pg_id
      WHERE u.id = ?
    `;
    
    const params = [otherId];
    
    if (pgId) {
      query += ` AND p.id = ?`;
      params.push(pgId);
    }
    
    query += ` AND (b.user_id = ? OR b.owner_id = ?) AND b.status IN ('confirmed', 'active', 'completed') LIMIT 1`;
    params.push(me.id, me.id);

    console.log("User query:", query, params);

    const [rows] = await db.query(query, params);

    if (!rows.length) {
      // Try a more general query if the specific one fails
      const [fallbackRows] = await db.query(
        `
        SELECT 
          u.id,
          u.name,
          u.role,
          NULL AS pg_id,
          NULL AS pg_name
        FROM users u
        WHERE u.id = ?
        `,
        [otherId]
      );

      if (fallbackRows.length) {
        return res.json(fallbackRows[0]);
      }

      return res.status(404).json({ message: "User not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Get user by ID error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📥 GET PRIVATE MESSAGES (PG BASED)
========================================================= */
exports.getPrivateMessages = async (req, res) => {
  try {
    const me = req.me;
    const otherId = Number(req.params.userId);
    const pgId = req.query.pgId ? Number(req.query.pgId) : null;

    console.log("Getting messages:", { meId: me.id, otherId, pgId });

    let query = `
      SELECT *
      FROM private_messages
      WHERE (
        (sender_id = ? AND receiver_id = ?)
        OR
        (sender_id = ? AND receiver_id = ?)
      )
    `;
    
    const params = [me.id, otherId, otherId, me.id];
    
    if (pgId) {
      query += ` AND pg_id = ?`;
      params.push(pgId);
    }
    
    query += ` ORDER BY created_at ASC`;

    console.log("Messages query:", query, params);

    const [rows] = await db.query(query, params);

    // Mark messages as read
    let updateQuery = `
      UPDATE private_messages
      SET is_read = 1
      WHERE sender_id = ? AND receiver_id = ?
    `;
    
    const updateParams = [otherId, me.id];
    
    if (pgId) {
      updateQuery += ` AND pg_id = ?`;
      updateParams.push(pgId);
    }
    
    await db.query(updateQuery, updateParams);

    res.json(rows);
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📤 SEND MESSAGE
========================================================= */
exports.sendPrivateMessage = async (req, res) => {
  try {
    const me = req.me;
    const { receiver_id, message, pg_id } = req.body;

    if (!receiver_id || !message?.trim() || !pg_id) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const [result] = await db.query(
      `INSERT INTO private_messages
       (sender_id, receiver_id, pg_id, message, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [me.id, receiver_id, pg_id, message]
    );

    const [newMessage] = await db.query(
      `SELECT * FROM private_messages WHERE id = ?`,
      [result.insertId]
    );

    res.json({
      ...newMessage[0],
      status: "sent"
    });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   ✏️ UPDATE MESSAGE
========================================================= */
exports.updatePrivateMessage = async (req, res) => {
  try {
    const me = req.me;

    await db.query(
      "UPDATE private_messages SET message = ?, updated_at = NOW() WHERE id = ? AND sender_id = ?",
      [req.body.message, req.params.id, me.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Update message error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   🗑 DELETE MESSAGE
========================================================= */
exports.deletePrivateMessage = async (req, res) => {
  try {
    const me = req.me;
    const messageId = req.params.id;

    const [[msg]] = await db.query(
      "SELECT sender_id, receiver_id FROM private_messages WHERE id = ?",
      [messageId]
    );

    if (!msg) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (msg.sender_id !== me.id && msg.receiver_id !== me.id) {
      return res.status(403).json({ message: "Not allowed" });
    }

    await db.query("DELETE FROM private_messages WHERE id = ?", [messageId]);

    res.json({ success: true });
  } catch (err) {
    console.error("Delete message error:", err);
    res.status(500).json({ message: "Server error" });
  }
};