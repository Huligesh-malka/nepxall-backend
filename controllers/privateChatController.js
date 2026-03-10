const db = require("../db");

/* =========================================================
   GET OR CREATE MYSQL USER FROM FIREBASE
========================================================= */
async function getMe(firebaseUser) {

  if (!firebaseUser) throw new Error("Firebase user missing");

  const uid = firebaseUser.uid;
  const name = firebaseUser.name || "User";
  const email = firebaseUser.email || null;
  const phone = firebaseUser.phone_number || null;

  let [rows] = await db.query(
    "SELECT id,name,email,role FROM users WHERE firebase_uid=? LIMIT 1",
    [uid]
  );

  if (rows.length) return rows[0];

  const [result] = await db.query(
    `INSERT INTO users (firebase_uid,name,email,phone,role)
     VALUES (?,?,?,?, 'tenant')`,
    [uid, name, email, phone]
  );

  return {
    id: result.insertId,
    name,
    role: "tenant"
  };
}

/* =========================================================
   LOAD USER
========================================================= */
exports.loadMe = async (req,res,next)=>{
  try{

    if(!req.user){
      return res.status(401).json({message:"Auth user missing"});
    }

    req.me = await getMe(req.user);
    next();

  }catch(err){
    console.error("loadMe error:",err);
    res.status(500).json({message:"Auth error"});
  }
};

/* =========================================================
   CURRENT USER
========================================================= */
exports.getMe = (req,res)=>{
  res.json(req.me);
};

/* =========================================================
   CHAT LIST
========================================================= */
exports.getMyChatList = async (req,res)=>{
  try{

    const me = req.me;

    const [rows] = await db.query(
`
SELECT 
u.id,
u.name,
u.firebase_uid,

pm.message AS last_message,
pm.created_at AS last_time,

CASE 
 WHEN pm.sender_id=? THEN 'me'
 ELSE 'other'
END AS last_sender

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
GROUP BY 
LEAST(sender_id,receiver_id),
GREATEST(sender_id,receiver_id)

)

ORDER BY last_time DESC
`,
[
me.id,
me.id,
me.id,
me.id
]
);

res.json(rows);

}catch(err){
console.error("Chat list error:",err);
res.status(500).json({message:"Server error"});
}
};

/* =========================================================
   SEND MESSAGE
========================================================= */
exports.sendPrivateMessage = async (req,res)=>{
try{

const me = req.me;
const {receiver_id,message} = req.body;

if(!receiver_id || !message?.trim())
return res.status(400).json({message:"Missing fields"});

const [result] = await db.query(
`
INSERT INTO private_messages
(sender_id,receiver_id,message,is_read)
VALUES (?,?,?,0)
`,
[me.id,receiver_id,message]
);

res.json({
id:result.insertId,
sender_id:me.id,
receiver_id,
message,
created_at:new Date(),
status:"sent"
});

}catch(err){
console.error(err);
res.status(500).json({message:"Server error"});
}
};

/* =========================================================
   DELETE MESSAGE
========================================================= */
exports.deletePrivateMessage = async (req,res)=>{
try{

const me = req.me;
const id = req.params.id;

const [[msg]] = await db.query(
"SELECT sender_id,receiver_id FROM private_messages WHERE id=?",
[id]
);

if(!msg)
return res.status(404).json({message:"Message not found"});

if(msg.sender_id!==me.id && msg.receiver_id!==me.id)
return res.status(403).json({message:"Not allowed"});

await db.query(
"DELETE FROM private_messages WHERE id=?",
[id]
);

res.json({success:true});

}catch(err){
console.error(err);
res.status(500).json({message:"Server error"});
}
};