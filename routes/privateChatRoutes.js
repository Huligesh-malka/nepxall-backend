const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const privateChat = require("../controllers/privateChatController");

/* 🔐 ALL PRIVATE CHAT ROUTES REQUIRE AUTH */
router.use(auth);

/* 👤 USER */
router.get("/me", privateChat.getMe);

/* 📃 CHAT LIST */
router.get("/list", privateChat.getMyChatList);

/* 👤 OTHER USER */
router.get("/user/:id", privateChat.getUserById);

/* 💬 MESSAGES */
router.get("/messages/:userId", privateChat.getPrivateMessages);
router.post("/send", privateChat.sendPrivateMessage);
router.put("/update/:id", privateChat.updatePrivateMessage);
router.delete("/delete/:id", privateChat.deletePrivateMessage);

module.exports = router;