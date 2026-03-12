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
    "SELECT id,name,email,role FROM users WHERE firebase_uid=? LIMIT 1",
    [uid]
  );

  if (rows.length) return rows[0];

  if (phone_number) {

    [rows] = await db.query(
      "SELECT id,name,email,role FROM users WHERE phone=? LIMIT 1",
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
    `INSERT INTO users (firebase_uid,name,email,phone,role)
     VALUES (?,?,?,?, 'tenant')`,
    [uid, name, email, phone_number]
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

    if(!req.me) req.me = await getMe(req.user);

    next();

  }catch(err){

    console.error(err);
    res.status(500).json({message:"Auth error"});

  }

};

exports.getMe = (req,res)=> res.json(req.me);

/* =========================================================
   📃 CHAT LIST (FAST USING chat_rooms)
========================================================= */
exports.getMyChatList = async (req,res)=>{

  try{

    const me = req.me;

    const [rows] = await db.query(
`
SELECT
  cr.id,
  cr.pg_id,
  cr.last_message,
  cr.last_message_time,

  u.id AS user_id,
  COALESCE(b.name,u.name,u.phone) AS name,
  u.firebase_uid,

  p.pg_name

FROM chat_rooms cr

JOIN users u
ON u.id =
CASE
 WHEN cr.user1_id=? THEN cr.user2_id
 ELSE cr.user1_id
END

JOIN pgs p ON p.id = cr.pg_id

LEFT JOIN bookings b
ON b.user_id = u.id
AND b.pg_id = cr.pg_id

WHERE cr.user1_id=? OR cr.user2_id=?

ORDER BY cr.last_message_time DESC
`,
      [me.id,me.id,me.id]
    );

    res.json(rows);

  }catch(err){

    console.error(err);
    res.status(500).json({message:"Server error"});

  }

};

/* =========================================================
   👤 GET USER + PG
========================================================= */
exports.getUserById = async (req,res)=>{

  try{

    const otherId = Number(req.params.id);
    const pg_id = Number(req.query.pg_id);

    const [rows] = await db.query(
`
SELECT
  u.id,
  COALESCE(b.name,u.name,u.phone) AS name,
  p.pg_name
FROM users u
JOIN pgs p ON p.id=?
LEFT JOIN bookings b
ON b.user_id=u.id AND b.pg_id=p.id
WHERE u.id=?
LIMIT 1
`,
      [pg_id,otherId]
    );

    if(!rows.length)
      return res.status(404).json({message:"User not found"});

    res.json(rows[0]);

  }catch(err){

    console.error(err);
    res.status(500).json({message:"Server error"});

  }

};

/* =========================================================
   📥 GET MESSAGES
========================================================= */
exports.getPrivateMessages = async (req,res)=>{

  try{

    const me = req.me;
    const otherId = Number(req.params.userId);
    const pg_id = Number(req.query.pg_id);

    const [rows] = await db.query(
`
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
`,
      [me.id,otherId,otherId,me.id,pg_id]
    );

    await db.query(
`
UPDATE private_messages
SET is_read=1
WHERE sender_id=? AND receiver_id=? AND pg_id=?
`,
      [otherId,me.id,pg_id]
    );

    res.json(rows);

  }catch(err){

    console.error(err);
    res.status(500).json({message:"Server error"});

  }

};

/* =========================================================
   📤 SEND MESSAGE
========================================================= */
exports.sendPrivateMessage = async (req,res)=>{

  try{

    const me = req.me;
    const {receiver_id,message,pg_id} = req.body;

    if(!receiver_id || !message?.trim() || !pg_id){
      return res.status(400).json({message:"Missing fields"});
    }

    const text = message.trim();

    /* SAVE MESSAGE */

    const [result] = await db.query(
`
INSERT INTO private_messages
(pg_id,sender_id,receiver_id,message,is_read)
VALUES (?,?,?,?,0)
`,
      [pg_id,me.id,receiver_id,text]
    );

    const messageId = result.insertId;

    /* UPDATE OR CREATE CHAT ROOM */

    const user1 = Math.min(me.id,receiver_id);
    const user2 = Math.max(me.id,receiver_id);

    const [room] = await db.query(
`
SELECT id FROM chat_rooms
WHERE user1_id=? AND user2_id=? AND pg_id=?
LIMIT 1
`,
      [user1,user2,pg_id]
    );

    if(room.length){

      await db.query(
`
UPDATE chat_rooms
SET last_message=?, last_message_time=NOW()
WHERE id=?
`,
        [text,room[0].id]
      );

    }else{

      await db.query(
`
INSERT INTO chat_rooms
(user1_id,user2_id,pg_id,last_message,last_message_time)
VALUES (?,?,?,?,NOW())
`,
        [user1,user2,pg_id,text]
      );

    }

    res.json({
      id:messageId,
      sender_id:me.id,
      receiver_id,
      pg_id,
      message:text,
      created_at:new Date(),
      status:"sent"
    });

  }catch(err){

    console.error(err);
    res.status(500).json({message:"Server error"});

  }

};

/* =========================================================
   🗑 DELETE MESSAGE
========================================================= */
exports.deletePrivateMessage = async (req,res)=>{

  try{

    const me = req.me;
    const messageId = req.params.id;

    const [[msg]] = await db.query(
`
SELECT sender_id,receiver_id
FROM private_messages
WHERE id=?
`,
      [messageId]
    );

    if(!msg)
      return res.status(404).json({message:"Message not found"});

    if(msg.sender_id!==me.id && msg.receiver_id!==me.id)
      return res.status(403).json({message:"Not allowed"});

    await db.query(
      "DELETE FROM private_messages WHERE id=?",
      [messageId]
    );

    res.json({success:true});

  }catch(err){

    console.error(err);
    res.status(500).json({message:"Server error"});

  }

};