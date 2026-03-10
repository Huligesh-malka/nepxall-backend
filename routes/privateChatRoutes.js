const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const chat = require("../controllers/privateChatController");

/* AUTH + USER LOAD */
router.use(auth, chat.loadMe);

/* CURRENT USER */
router.get("/me", chat.getMe);

/* CHAT LIST */
router.get("/list", chat.getMyChatList);

/* GET USER */
router.get("/user/:id", chat.getUserById);

/* GET MESSAGES */
router.get("/messages/:userId", chat.getPrivateMessages);

/* SEND MESSAGE */
router.post("/send", chat.sendPrivateMessage);

/* UPDATE MESSAGE */
router.put("/message/:id", chat.updatePrivateMessage);

/* DELETE MESSAGE */
router.delete("/message/:id", chat.deletePrivateMessage);

module.exports = router;