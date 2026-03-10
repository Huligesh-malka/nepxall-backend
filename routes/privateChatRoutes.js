const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const privateChat = require("../controllers/privateChatController");

/* AUTH + USER LOAD */
router.use(auth, privateChat.loadMe);

/* CURRENT USER */
router.get("/me", privateChat.getMe);

/* CHAT LIST */
router.get("/list", privateChat.getMyChatList);

/* GET USER + PG */
router.get("/user/:id/:pgId", privateChat.getUserById);

/* GET MESSAGES */
router.get("/messages/:userId/:pgId", privateChat.getPrivateMessages);

/* SEND MESSAGE */
router.post("/send", privateChat.sendPrivateMessage);

/* UPDATE MESSAGE */
router.put("/message/:id", privateChat.updatePrivateMessage);

/* DELETE MESSAGE */
router.delete("/message/:id", privateChat.deletePrivateMessage);

module.exports = router;