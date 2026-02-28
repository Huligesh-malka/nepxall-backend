const db = require("../db");

/* =========================================================
   🧠 GET OR CREATE MYSQL USER FROM FIREBASE (SAFE)
========================================================= */
async function getMe(firebaseUser) {

  // ✅ SUPPORT BOTH AUTH FORMATS
  const uid = firebaseUser.uid || firebaseUser.firebaseUid;
  const name = firebaseUser.name || "User";
  const email = firebaseUser.email || null;
  const phone_number = firebaseUser.phone_number || firebaseUser.phone || null;

  // ✅ IF MYSQL ID ALREADY PROVIDED → SKIP DB SEARCH
  if (firebaseUser.mysqlId) {
    return {
      id: firebaseUser.mysqlId,
      name,
      email,
      role: firebaseUser.role
    };
  }

  if (!uid) throw new Error("Firebase UID missing");

  /* 1️⃣ FIND BY FIREBASE UID */
  let [rows] = await db.query(
    "SELECT id, name, email, role FROM users WHERE firebase_uid=? LIMIT 1",
    [uid]
  );

  if (rows.length) return rows[0];

  /* 2️⃣ FIND BY PHONE */
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

  /* 3️⃣ CREATE NEW USER */
  const [result] = await db.query(
    `INSERT INTO users (firebase_uid, name, email, phone, role)
     VALUES (?, ?, ?, ?, 'tenant')`,
    [
      uid,
      name || (email ? email.split("@")[0] : "User"),
      email,
      phone_number,
    ]
  );

  return {
    id: result.insertId,
    name,
    role: "tenant",
  };
}

/* =========================================================
   🔐 LOAD USER MIDDLEWARE
========================================================= */
exports.loadMe = async (req, res, next) => {
  try {
    if (!req.me) {
      req.me = await getMe(req.user);
    }
    next();
  } catch (err) {
    console.error("loadMe error:", err);
    res.status(500).json({ message: "Auth error" });
  }
};

/* =========================================================
   👤 GET LOGGED IN USER
========================================================= */
exports.getMe = (req, res) => {
  res.json(req.me);
};

/* =========================================================
   📃 CHAT LIST WITH UNREAD COUNT
========================================================= */
exports.getMyChatList = async (req, res) => {
  try {
    const me = req.me;

    const [rows] = await db.query(
      `
      SELECT 
        u.id,
        COALESCE(u.name, SUBSTRING_INDEX(u.email,'@',1),'User') AS name,
        u.firebase_uid,

        pm.message AS last_message,
        pm.created_at AS last_time,

        CASE WHEN pm.sender_id=? THEN 'me' ELSE 'other' END AS last_sender,

        (
          SELECT COUNT(*) FROM private_messages
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

      WHERE pm.id IN (
        SELECT MAX(id)
        FROM private_messages
        WHERE sender_id=? OR receiver_id=?
        GROUP BY LEAST(sender_id,receiver_id),
                 GREATEST(sender_id,receiver_id)
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
exports.getUserById = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, firebase_uid FROM users WHERE id=? LIMIT 1",
      [req.params.id]
    );

    if (!rows.length)
      return res.status(404).json({ message: "User not found" });

    res.json(rows[0]);

  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📥 GET MESSAGES + MARK AS READ
========================================================= */
exports.getPrivateMessages = async (req, res) => {
  try {
    const me = req.me;
    const otherId = Number(req.params.userId);

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

/* =========================================================
   📤 SEND MESSAGE
========================================================= */
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

/* =========================================================
   ✏️ UPDATE MESSAGE
========================================================= */
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

/* =========================================================
   🗑 DELETE MESSAGE
========================================================= */
exports.deletePrivateMessage = async (req, res) => {
  try {
    const me = req.me;

    await db.query(
      "DELETE FROM private_messages WHERE id=? AND sender_id=?",
      [req.params.id, me.id]
    );

    res.json({ success: true });

  } catch {
    res.status(500).json({ message: "Server error" });
  }
};