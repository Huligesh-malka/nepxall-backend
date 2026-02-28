const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const privateChat = require("../controllers/privateChatController");

/* 🔐 ALL PRIVATE CHAT ROUTES REQUIRE AUTH */
router.use(auth);

/* 👤 USER (load once) */
router.get("/me", privateChat.loadMe, privateChat.getMe);

/* 📃 CHAT LIST */
router.get("/list", privateChat.loadMe, privateChat.getMyChatList);

/* 👤 OTHER USER */
router.get("/user/:id", privateChat.loadMe, privateChat.getUserById);

/* 💬 MESSAGES */
router.get("/messages/:userId", privateChat.loadMe, privateChat.getPrivateMessages);

/* 📤 SEND */
router.post("/send", privateChat.loadMe, privateChat.sendPrivateMessage);

/* ✏️ UPDATE */
router.put("/update/:id", privateChat.loadMe, privateChat.updatePrivateMessage);

/* 🗑 DELETE */
router.delete("/delete/:id", privateChat.loadMe, privateChat.deletePrivateMessage);

module.exports = router;