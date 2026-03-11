const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const privateChat = require("../controllers/privateChatController");

/* 🔐 APPLY AUTH + USER LOAD */
router.use(auth, privateChat.loadMe);

/* 👤 CURRENT USER */
router.get("/me", privateChat.getMe);

/* 📃 CHAT LIST */
router.get("/list", privateChat.getMyChatList);

/* 👤 GET OTHER USER + PG */
router.get("/user/:id", privateChat.getUserById);
/* example:
   /user/214?pg_id=7
*/

/* 💬 GET MESSAGES (IMPORTANT: PG ID REQUIRED) */
router.get("/messages/:userId", privateChat.getPrivateMessages);
/* example:
   /messages/214?pg_id=7
*/

/* 📤 SEND MESSAGE */
router.post("/send", privateChat.sendPrivateMessage);
/* body:
{
  receiver_id: 214,
  pg_id: 7,
  message: "Hello"
}
*/

/* ✏️ UPDATE MESSAGE */
router.put("/message/:id", privateChat.updatePrivateMessage);

/* 🗑 DELETE MESSAGE */
router.delete("/message/:id", privateChat.deletePrivateMessage);

module.exports = router;