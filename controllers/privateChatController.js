const db = require("../db");

/* =========================================================
   🧠 GET OR CREATE MYSQL USER FROM FIREBASE (SAFE)
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
    "SELECT id, name, email, role FROM users WHERE firebase_uid=? LIMIT 1",
    [uid]
  );

  if (rows.length) return rows[0];

  if (phone_number) {
    [rows] = await db.query(
      "SELECT id, name, email, role FROM users WHERE phone=? LIMIT 1",
      [phone_number]
    );

    if (rows.length) {
      await db.query(
        "UPDATE users SET firebase_uid=? WHERE id=?",
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
    role: "tenant",
  };
}

/* ========================================================= */
exports.loadMe = async (req, res, next) => {
  try {
    if (!req.me) req.me = await getMe(req.user);
    next();
  } catch (err) {
    console.error("loadMe error:", err);
    res.status(500).json({ message: "Auth error" });
  }
};

/* ========================================================= */
exports.getMe = (req, res) => res.json(req.me);

/* =========================================================
   📃 CHAT LIST (UNCHANGED)
========================================================= */
exports.getMyChatList = async (req, res) => {
  try {
    const me = req.me;

    const [rows] = await db.query(
      `
SELECT 
  u.id,

  /* 🎯 OWNER → booking.name | TENANT → pg_name */
  CASE 
    WHEN ? = 'owner' THEN COALESCE(b.name, u.name, 'User')
    ELSE p.pg_name
  END AS name,

  p.pg_name,
  u.firebase_uid,

  pm.message AS last_message,
  pm.created_at AS last_time,

  CASE 
    WHEN pm.sender_id=? THEN 'me' 
    ELSE 'other' 
  END AS last_sender,

  (
    SELECT COUNT(*)
    FROM private_messages
    WHERE sender_id = u.id
      AND receiver_id = ?
      AND is_read = 0
  ) AS unread

FROM private_messages pm

JOIN users u 
  ON u.id = CASE 
      WHEN pm.sender_id=? THEN pm.receiver_id 
      ELSE pm.sender_id 
    END

/* ✅ BOOKING JOIN */
JOIN bookings b 
  ON (
    (b.user_id = u.id AND b.owner_id = ?)
    OR
    (b.owner_id = u.id AND b.user_id = ?)
  )

JOIN pgs p ON p.id = b.pg_id

WHERE pm.id IN (
  SELECT MAX(id)
  FROM private_messages
  WHERE sender_id=? OR receiver_id=?
  GROUP BY LEAST(sender_id,receiver_id),
           GREATEST(sender_id,receiver_id)
)

ORDER BY last_time DESC
`,
      [
        me.role,
        me.id,
        me.id,
        me.id,
        me.id,
        me.id,
        me.id,
        me.id
      ]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   👤 GET OTHER USER + PG NAME
========================================================= */
exports.getUserById = async (req, res) => {
  try {
    const me = req.me;
    const otherId = Number(req.params.id);

    const [rows] = await db.query(
      `
SELECT 
  u.id,

  /* 🎯 ROLE BASED NAME */
  CASE 
    WHEN ? = 'tenant' THEN p.pg_name      -- tenant sees PG name
    ELSE b.name                           -- owner sees tenant name
  END AS name,

  p.pg_name

FROM bookings b
JOIN pgs p ON p.id = b.pg_id
JOIN users u 
  ON (
    (u.id = b.owner_id AND b.user_id = ?)
    OR
    (u.id = b.user_id AND b.owner_id = ?)
  )

WHERE u.id = ?
LIMIT 1
      `,
      [me.role, me.id, me.id, otherId]
    );

    if (!rows.length)
      return res.status(404).json({ message: "User not found" });

    res.json(rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
/* =========================================================
   📥 GET MESSAGES + 🔒 ACCESS PROTECTION
========================================================= */
exports.getPrivateMessages = async (req, res) => {
  try {
    const me = req.me;
    const otherId = Number(req.params.userId);

    /* 🔒 BOOKING RELATION CHECK */
    const [access] = await db.query(
      `
      SELECT 1
      FROM bookings b
      JOIN pgs p ON p.id = b.pg_id
      WHERE 
      (b.user_id=? AND p.owner_id=?)
      OR
      (b.user_id=? AND p.owner_id=?)
      LIMIT 1
      `,
      [me.id, otherId, otherId, me.id]
    );

    if (!access.length)
      return res.status(403).json({ message: "Not allowed to chat" });

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
      [me.id, otherId, otherId, me.id]
    );

    await db.query(
      `UPDATE private_messages 
       SET is_read = 1 
       WHERE sender_id=? AND receiver_id=?`,
      [otherId, me.id]
    );

    res.json(rows);

  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

/* ========================================================= */
exports.sendPrivateMessage = async (req, res) => {
  try {
    const me = req.me;
    const { receiver_id, message } = req.body;

    if (!receiver_id || !message?.trim())
      return res.status(400).json({ message: "Missing fields" });

    const [result] = await db.query(
      `INSERT INTO private_messages 
       (sender_id, receiver_id, message, is_read)
       VALUES (?, ?, ?, 0)`,
      [me.id, receiver_id, message]
    );

    res.json({
      id: result.insertId,
      sender_id: me.id,
      receiver_id,
      message,
      created_at: new Date(),
      status: "sent",
    });

  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

/* ========================================================= */
exports.updatePrivateMessage = async (req, res) => {
  try {
    const me = req.me;

    await db.query(
      "UPDATE private_messages SET message=? WHERE id=? AND sender_id=?",
      [req.body.message, req.params.id, me.id]
    );

    res.json({ success: true });

  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

/* ========================================================= */
exports.deletePrivateMessage = async (req, res) => {
  try {
    const me = req.me;
    const messageId = req.params.id;

    /* 🔍 Check message belongs to this user */
    const [[msg]] = await db.query(
      `SELECT sender_id, receiver_id 
       FROM private_messages 
       WHERE id=?`,
      [messageId]
    );

    if (!msg) {
      return res.status(404).json({ message: "Message not found" });
    }

    /* ❌ Not your message */
    if (msg.sender_id !== me.id && msg.receiver_id !== me.id) {
      return res.status(403).json({ message: "Not allowed" });
    }

    /* 🗑 PERMANENT DELETE */
    await db.query(
      `DELETE FROM private_messages WHERE id=?`,
      [messageId]
    );

    res.json({ success: true, type: "permanent" });

  } catch (err) {
    console.error("DELETE MESSAGE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};