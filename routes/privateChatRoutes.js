const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const privateChat = require("../controllers/privateChatController");

/* 🔐 APPLY MIDDLEWARE ONCE */
router.use(auth, privateChat.loadMe);

/* 👤 CURRENT USER */
router.get("/me", privateChat.getMe);

/* 📃 CHAT LIST */
router.get("/list", privateChat.getMyChatList);

/* 👤 GET OTHER USER */
router.get("/user/:id", privateChat.getUserById);

/* 💬 GET MESSAGES */
router.get("/messages/:userId", privateChat.getPrivateMessages);

/* 📤 SEND MESSAGE */
router.post("/send", privateChat.sendPrivateMessage);

/* ✏️ UPDATE MESSAGE */
router.put("/message/:id", privateChat.updatePrivateMessage);

/* 🗑 PERMANENT DELETE MESSAGE */


module.exports = router;