const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const chat = require("../controllers/privateChatController");

router.use(auth, chat.loadMe);

/* CURRENT USER */
router.get("/me", chat.getMe);

/* CHAT LIST */
router.get("/list", chat.getMyChatList);

/* SEND MESSAGE */
router.post("/send", chat.sendPrivateMessage);

/* DELETE MESSAGE */
router.delete("/message/:id", chat.deletePrivateMessage);

module.exports = router;