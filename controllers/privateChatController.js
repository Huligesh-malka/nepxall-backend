const db = require("../db");
const crypto = require("crypto");
const sendNotification = require("../utils/sendNotification"); // ✅ ADDED

/* =========================================================
   GET OR CREATE MYSQL USER FROM FIREBASE
========================================================= */
async function getMe(firebaseUser) {

  const uid = firebaseUser.uid || firebaseUser.firebase_uid;
  const name = firebaseUser.name || "User";
  const email = firebaseUser.email || null;
  const phone = firebaseUser.phone_number || firebaseUser.phone || null;

  if (!uid) throw new Error("Firebase UID missing");

  let [rows] = await db.query(
    "SELECT id,name,email,role, fcm_token FROM users WHERE firebase_uid=? LIMIT 1",
    [uid]
  );

  if (rows.length) return rows[0];

  if (phone) {

    [rows] = await db.query(
      "SELECT id,name,email,role, fcm_token FROM users WHERE phone=? LIMIT 1",
      [phone]
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
    `INSERT INTO users(firebase_uid,name,email,phone,role)
     VALUES (?,?,?,?, 'tenant')`,
    [uid, name, email, phone]
  );

  return {
    id: result.insertId,
    name,
    role: "tenant"
  };
}

/* ========================================================= */
exports.loadMe = async (req,res,next)=>{

  try{

    if(!req.me){
      req.me = await getMe(req.user);
    }

    next();

  }catch(err){

    console.error("loadMe error:",err);

    res.status(500).json({
      success:false,
      message:"Auth error"
    });

  }

};

/* ========================================================= */
exports.getMe = (req,res)=> res.json(req.me);

/* =========================================================
   CHAT LIST
========================================================= */
exports.getMyChatList = async (req,res)=>{

  try{

    const me = req.me;

    const [rows] = await db.query(`
SELECT
u.id,
COALESCE(b.name,u.name,u.phone) AS name,
pm.pg_id,
p.pg_name,
u.firebase_uid,
u.fcm_token,
pm.message AS last_message,
pm.created_at AS last_time,

CASE
WHEN pm.sender_id=? THEN 'me'
ELSE 'other'
END AS last_sender,

(
SELECT COUNT(*)
FROM private_messages
WHERE sender_id=u.id
AND receiver_id=?
AND is_read=0
AND pg_id=pm.pg_id
) AS unread

FROM private_messages pm

JOIN users u
ON u.id =
CASE
WHEN pm.sender_id=? THEN pm.receiver_id
ELSE pm.sender_id
END

JOIN pgs p
ON p.id=pm.pg_id

LEFT JOIN bookings b
ON b.user_id=u.id
AND b.pg_id=pm.pg_id

WHERE pm.id IN (
SELECT MAX(id)
FROM private_messages
WHERE sender_id=? OR receiver_id=?
GROUP BY
LEAST(sender_id,receiver_id),
GREATEST(sender_id,receiver_id),
pg_id
)

ORDER BY last_time DESC
`,
      [me.id,me.id,me.id,me.id,me.id]
    );

    res.json(rows);

  }catch(err){

    console.error("Chat list error:",err);

    res.status(500).json({
      success:false,
      message:"Server error"
    });

  }

};

/* =========================================================
   GET USER (OWNER) BY PG
   ✅ FIXED: Always return PG OWNER (not same user)
========================================================= */
exports.getUserById = async (req, res) => {
  try {
    const pg_id = Number(req.query.pg_id);

    if (!pg_id) {
      return res.status(400).json({
        message: "pg_id required",
      });
    }

    // ✅ Get OWNER of this PG
    const [rows] = await db.query(`
      SELECT
        u.id,
        COALESCE(u.name, u.phone) AS name,
        p.pg_name,
        u.firebase_uid,
        u.fcm_token
      FROM pgs p
      JOIN users u ON u.id = p.owner_id   -- ✅ OWNER JOIN
      LEFT JOIN bookings b
        ON b.user_id = u.id
        AND b.pg_id = p.id
      WHERE p.id = ?
      LIMIT 1
    `, [pg_id]);

    if (!rows.length) {
      return res.status(404).json({
        message: "Owner not found",
      });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("getUserById error:", err);

    res.status(500).json({
      message: "Server error",
    });
  }
};

/* =========================================================
   GET PRIVATE MESSAGES
========================================================= */
exports.getPrivateMessages = async (req,res)=>{

  try{

    const me = req.me;
    const otherId = Number(req.params.userId);
    const pg_id = Number(req.query.pg_id);
    const limit = Number(req.query.limit) || 50;

    const [rows] = await db.query(`
SELECT *
FROM private_messages
WHERE
(
sender_id=? AND receiver_id=?
OR
sender_id=? AND receiver_id=?
)
AND pg_id=?
ORDER BY id ASC
LIMIT ?
`,
      [me.id,otherId,otherId,me.id,pg_id,limit]
    );

    await db.query(`
UPDATE private_messages
SET is_read=1
WHERE sender_id=? AND receiver_id=? AND pg_id=?
`,
      [otherId,me.id,pg_id]
    );

    res.json(rows);

  }catch(err){

    console.error("get messages error:",err);

    res.status(500).json({
      message:"Server error"
    });

  }

};

/* =========================================================
   SEND MESSAGE
========================================================= */
exports.sendPrivateMessage = async (req,res)=>{

  try{

    const me = req.me;
    const {receiver_id, message, pg_id} = req.body;

    if(!receiver_id || !message?.trim() || !pg_id){

      return res.status(400).json({
        message:"Missing fields"
      });

    }

    const text = message.trim();

    /* CREATE HASH */
    const message_hash = crypto
      .createHash("sha256")
      .update(`${me.id}_${receiver_id}_${pg_id}_${text}_${Date.now()}`)
      .digest("hex");

    /* SAVE MESSAGE */
    const [result] = await db.query(`
INSERT INTO private_messages
(pg_id,sender_id,receiver_id,message,is_read,message_hash)
VALUES (?,?,?,?,0,?)
`,
      [pg_id, me.id, receiver_id, text, message_hash]
    );

    /* UPDATE CHAT ROOM */
    await db.query(`
INSERT INTO chat_rooms
(user1_id,user2_id,pg_id,last_message,last_message_time)
VALUES (?,?,?,?,NOW())
ON DUPLICATE KEY UPDATE
last_message=VALUES(last_message),
last_message_time=VALUES(last_message_time)
`,
      [
        Math.min(me.id, receiver_id),
        Math.max(me.id, receiver_id),
        pg_id,
        text
      ]
    );

    //////////////////////////////////////////////////////
    // 🔔 GET RECEIVER DETAILS FOR NOTIFICATION
    //////////////////////////////////////////////////////
    const [[receiver]] = await db.query(
      `SELECT u.id, u.name, u.fcm_token, p.pg_name
       FROM users u
       LEFT JOIN pgs p ON p.id = ?
       WHERE u.id = ?`,
      [pg_id, receiver_id]
    );

    // Get PG name for notification
    const [[pgInfo]] = await db.query(
      "SELECT pg_name FROM pgs WHERE id = ?",
      [pg_id]
    );

    //////////////////////////////////////////////////////
    // 🔔 SEND PUSH NOTIFICATION TO RECEIVER
    //////////////////////////////////////////////////////
    if (receiver?.fcm_token) {
      await sendNotification(
        receiver.fcm_token,
        "New Message 💬",
        `${me.name || "Someone"} sent you a message regarding ${pgInfo?.pg_name || "PG"}`
      );
    }

    // Insert in-app notification for receiver
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        receiver_id,
        "New Message 💬",
        `${me.name || "Someone"} sent you a message regarding ${pgInfo?.pg_name || "PG"}`,
        "new_message"
      ]
    );

    res.json({
      id: result.insertId,
      sender_id: me.id,
      sender_name: me.name,
      receiver_id,
      pg_id,
      message: text,
      created_at: new Date(),
      message_hash,
      status: "sent",
      notification_sent: !!receiver?.fcm_token
    });

  }catch(err){

    console.error("send message error:", err);

    res.status(500).json({
      message: "Server error"
    });

  }

};

/* =========================================================
   UPDATE MESSAGE
========================================================= */
exports.updatePrivateMessage = async (req,res)=>{

  try{

    const me = req.me;

    await db.query(
      "UPDATE private_messages SET message=? WHERE id=? AND sender_id=?",
      [req.body.message, req.params.id, me.id]
    );

    res.json({success: true});

  }catch(err){

    console.error(err);

    res.status(500).json({
      message:"Server error"
    });

  }

};

/* =========================================================
   DELETE MESSAGE
========================================================= */
exports.deletePrivateMessage = async (req,res)=>{

  try{

    const me = req.me;
    const messageId = req.params.id;

    const [[msg]] = await db.query(`
SELECT sender_id,receiver_id
FROM private_messages
WHERE id=?
`,
      [messageId]
    );

    if(!msg){
      return res.status(404).json({
        message:"Message not found"
      });
    }

    if(msg.sender_id !== me.id && msg.receiver_id !== me.id){
      return res.status(403).json({
        message:"Not allowed"
      });
    }

    await db.query(
      "DELETE FROM private_messages WHERE id=?",
      [messageId]
    );

    res.json({success:true});

  }catch(err){

    console.error(err);

    res.status(500).json({
      message:"Server error"
    });

  }

};

/* =========================================================
   MARK MESSAGES AS READ
========================================================= */
exports.markMessagesAsRead = async (req, res) => {
  try {
    const me = req.me;
    const { sender_id, pg_id } = req.body;

    if (!sender_id || !pg_id) {
      return res.status(400).json({
        message: "sender_id and pg_id required"
      });
    }

    const [result] = await db.query(`
      UPDATE private_messages
      SET is_read = 1
      WHERE sender_id = ?
        AND receiver_id = ?
        AND pg_id = ?
        AND is_read = 0
    `, [sender_id, me.id, pg_id]);

    res.json({
      success: true,
      updated_count: result.affectedRows
    });

  } catch (err) {
    console.error("Mark messages as read error:", err);
    res.status(500).json({
      message: "Server error"
    });
  }
};

/* =========================================================
   GET UNREAD MESSAGE COUNT
========================================================= */
exports.getUnreadCount = async (req, res) => {
  try {
    const me = req.me;

    const [rows] = await db.query(`
      SELECT 
        COUNT(*) as total_unread,
        pg_id,
        sender_id
      FROM private_messages
      WHERE receiver_id = ? AND is_read = 0
      GROUP BY pg_id, sender_id
    `, [me.id]);

    res.json({
      success: true,
      unread: rows
    });

  } catch (err) {
    console.error("Get unread count error:", err);
    res.status(500).json({
      message: "Server error"
    });
  }
};

/* =========================================================
   GET CHAT DETAILS WITH PG INFO
========================================================= */
exports.getChatDetails = async (req, res) => {
  try {
    const me = req.me;
    const { pg_id, other_user_id } = req.params;

    const [rows] = await db.query(`
      SELECT 
        p.id as pg_id,
        p.pg_name,
        u.id as user_id,
        COALESCE(u.name, u.phone) as user_name,
        u.fcm_token
      FROM pgs p
      JOIN users u ON u.id = ?
      WHERE p.id = ?
    `, [other_user_id, pg_id]);

    if (!rows.length) {
      return res.status(404).json({
        message: "Chat details not found"
      });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("Get chat details error:", err);
    res.status(500).json({
      message: "Server error"
    });
  }
};