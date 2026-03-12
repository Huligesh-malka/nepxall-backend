const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const privateChat = require("../controllers/privateChatController");

/* 🔐 AUTH */
router.use(auth, privateChat.loadMe);

/* 👤 CURRENT USER */
router.get("/me", privateChat.getMe);

/* 📃 CHAT LIST */
router.get("/list", privateChat.getMyChatList);

/* 👤 USER + PG */
router.get("/user/:id", privateChat.getUserById);

/* 💬 MESSAGES */
router.get("/messages/:userId", privateChat.getPrivateMessages);

/* 📤 SEND */
router.post("/send", privateChat.sendPrivateMessage);

/* ✏ UPDATE */
router.put("/message/:id", privateChat.updatePrivateMessage);

/* 🗑 DELETE */
router.delete("/message/:id", privateChat.deletePrivateMessage);

module.exports = router;