const db = require("../db");

/* =========================================================
   🧠 GET OR CREATE MYSQL USER FROM FIREBASE (SAFE)
========================================================= */
async function getMe(firebaseUser) {
  const { uid, name, email, phone_number } = firebaseUser;

  if (!uid) throw new Error("Firebase UID missing");

  // 1️⃣ find by firebase_uid
  let [rows] = await db.query(
    "SELECT id, name, email, role FROM users WHERE firebase_uid=?",
    [uid]
  );

  if (rows.length) return rows[0];

  // 2️⃣ find by phone (EXISTING ACCOUNT)
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

  // 3️⃣ create new user (ONLY ONCE)
  const [result] = await db.query(
    `INSERT INTO users (firebase_uid, name, email, phone, role)
     VALUES (?, ?, ?, ?, 'tenant')`,
    [
      uid,
      name || (email ? email.split("@")[0] : "User"),
      email || null,
      phone_number,
    ]
  );

  return {
    id: result.insertId,
    name: name || "User",
    role: "tenant",
  };
}

/* =========================================================
   🔐 MIDDLEWARE TO LOAD USER ONCE
========================================================= */
async function loadMe(req, res, next) {
  try {
    if (!req.me) {
      req.me = await getMe(req.user);
    }
    next();
  } catch (err) {
    console.error("loadMe error:", err);
    res.status(500).json({ message: "Auth error" });
  }
}

/* =========================================================
   👤 GET LOGGED IN USER
========================================================= */
const getMeHandler = async (req, res) => {
  res.json(req.me);
};

/* =========================================================
   📃 CHAT LIST
========================================================= */
const getMyChatList = async (req, res) => {
  try {
    const me = req.me;

    const [rows] = await db.query(
      `
      SELECT 
        u.id,
        COALESCE(u.name, SUBSTRING_INDEX(u.email,'@',1),'User') AS name,
        pm.message AS last_message,
        pm.created_at AS last_time,
        CASE WHEN pm.sender_id=? THEN 'me' ELSE 'other' END AS last_sender
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
      [me.id, me.id, me.id, me.id]
    );

    res.json(rows);
  } catch (err) {
    console.error("getMyChatList error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📥 GET MESSAGES
========================================================= */
const getPrivateMessages = async (req, res) => {
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

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   📤 SEND MESSAGE
========================================================= */
const sendPrivateMessage = async (req, res) => {
  try {
    const me = req.me;
    const { receiver_id, message } = req.body;

    if (!receiver_id || !message)
      return res.status(400).json({ message: "Missing fields" });

    const [result] = await db.query(
      `INSERT INTO private_messages 
       (sender_id, receiver_id, message)
       VALUES (?, ?, ?)`,
      [me.id, receiver_id, message]
    );

    res.json({
      id: result.insertId,
      sender_id: me.id,
      receiver_id,
      message,
      created_at: new Date(),
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ========================================================= */
module.exports = {
  loadMe,
  getMe: getMeHandler,
  getMyChatList,
  getPrivateMessages,
  sendPrivateMessage,
};