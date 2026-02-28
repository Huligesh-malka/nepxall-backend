const db = require("../db");

/* =========================================================
   🧠 GET OR CREATE MYSQL USER
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
      name: name || email?.split("@")[0] || "User",
      role: "tenant",
    };
  }

  return rows[0];
}

/* =========================================================
   📃 CHAT LIST (OWNER + TENANT SAFE)
========================================================= */
exports.getMyChatList = async (req, res) => {
  try {
    const me = await getMe(req.user);

    const [rows] = await db.query(
      `
      SELECT 
        u.id,
        u.firebase_uid,

        CASE 
          WHEN u.role = 'owner'
            THEN (SELECT pg_name FROM pgs WHERE owner_id = u.id LIMIT 1)
          ELSE COALESCE(u.name, SUBSTRING_INDEX(u.email,'@',1),'User')
        END AS name,

        MAX(pm.created_at) AS last_time,

        SUBSTRING_INDEX(
          GROUP_CONCAT(pm.message ORDER BY pm.created_at DESC),
          ',',1
        ) AS last_message,

        CASE 
          WHEN SUBSTRING_INDEX(
            GROUP_CONCAT(pm.sender_id ORDER BY pm.created_at DESC),
            ',',1
          ) = ? THEN 'me'
          ELSE 'other'
        END AS last_sender,

        SUM(
          CASE 
            WHEN pm.receiver_id = ? 
            AND pm.sender_id = u.id 
            AND pm.is_read = 0 
            THEN 1 ELSE 0 
          END
        ) AS unread

      FROM users u

      JOIN private_messages pm
        ON (
          (pm.sender_id = u.id AND pm.receiver_id = ?)
          OR
          (pm.receiver_id = u.id AND pm.sender_id = ?)
        )

      WHERE u.id != ?

      GROUP BY u.id
      ORDER BY last_time DESC
      `,
      [me.id, me.id, me.id, me.id, me.id]
    );

    res.json(rows);
  } catch (err) {
    console.error("Chat list error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   👤 GET LOGGED USER
========================================================= */
exports.getMe = async (req, res) => {
  const me = await getMe(req.user);
  res.json(me);
};

/* =========================================================
   👤 GET USER BY ID
========================================================= */
exports.getUserById = async (req, res) => {
  const [rows] = await db.query(
    `
    SELECT id, firebase_uid,
    COALESCE(name, SUBSTRING_INDEX(email,'@',1),'User') AS name
    FROM users WHERE id=?
    `,
    [req.params.id]
  );

  res.json(rows[0] || null);
};

/* =========================================================
   📤 SEND MESSAGE
========================================================= */
exports.sendPrivateMessage = async (req, res) => {
  try {
    const me = await getMe(req.user);
    const receiverId = Number(req.body.receiver_id);
    const message = req.body.message?.trim();

    const [result] = await db.query(
      `INSERT INTO private_messages (sender_id, receiver_id, message)
       VALUES (?, ?, ?)`,
      [me.id, receiverId, message]
    );

    res.json({
      id: result.insertId,
      sender_id: me.id,
      receiver_id: receiverId,
      message,
      created_at: new Date(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📥 GET CONVERSATION
========================================================= */
exports.getPrivateMessages = async (req, res) => {
  try {
    const me = await getMe(req.user);
    const otherUserId = Number(req.params.userId);

    await db.query(
      `UPDATE private_messages
       SET is_read = 1
       WHERE sender_id = ? AND receiver_id = ?`,
      [otherUserId, me.id]
    );

    const [rows] = await db.query(
      `
      SELECT *
      FROM private_messages
      WHERE
        (sender_id=? AND receiver_id=?)
        OR
        (sender_id=? AND receiver_id=?)
      ORDER BY created_at ASC
      `,
      [me.id, otherUserId, otherUserId, me.id]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};