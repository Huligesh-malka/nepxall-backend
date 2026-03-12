const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const privateChat = require("../controllers/privateChatController");

/* =========================================================
   🔐 APPLY AUTH + LOAD USER
========================================================= */
router.use(auth, privateChat.loadMe);

/* =========================================================
   👤 CURRENT USER
========================================================= */
router.get("/me", privateChat.getMe);

/* =========================================================
   📃 CHAT LIST (FROM chat_rooms)
========================================================= */
router.get("/list", privateChat.getMyChatList);

/*
Example:
GET /private-chat/list
*/

/* =========================================================
   👤 GET OTHER USER + PG
========================================================= */
router.get("/user/:id", privateChat.getUserById);

/*
Example:
GET /private-chat/user/214?pg_id=7
*/

/* =========================================================
   💬 GET MESSAGES (WITH PAGINATION)
========================================================= */
router.get("/messages/:userId", privateChat.getPrivateMessages);

/*
Example:
GET /private-chat/messages/214?pg_id=7&limit=50&before=200
*/

/* =========================================================
   📤 SEND MESSAGE
========================================================= */
router.post("/send", privateChat.sendPrivateMessage);

/*
Body Example:

{
  "receiver_id": 214,
  "pg_id": 7,
  "message": "Hello"
}
*/

/* =========================================================
   ✏️ UPDATE MESSAGE
========================================================= */
router.put("/message/:id", privateChat.updatePrivateMessage);

/*
Example:
PUT /private-chat/message/99
{
  "message":"Edited text"
}
*/

/* =========================================================
   🗑 DELETE MESSAGE
========================================================= */
router.delete("/message/:id", privateChat.deletePrivateMessage);

/*
Example:
DELETE /private-chat/message/99
*/

module.exports = router;