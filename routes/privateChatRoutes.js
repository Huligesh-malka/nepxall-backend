const express = require("express");
const router = express.Router();
const privateChat = require("../controllers/privateChatController");
const auth = require("../middlewares/auth");

// All routes here require Firebase Auth middleware
router.use(auth);

/* =========================================================
   👤 USER & LIST ROUTES
========================================================= */
// GET /api/private-chat/list -> Load the dashboard chat list
router.get("/list", privateChat.getMyChatList); 

// GET /api/private-chat/me -> Get current user info
router.get("/me", privateChat.getMe);

// GET /api/private-chat/user/:id -> Get specific user info (name/avatar)
router.get("/user/:id", privateChat.getUserById);

/* =========================================================
   💬 MESSAGE OPERATIONS
========================================================= */
// GET /api/private-chat/messages/:userId -> Load chat history
router.get("/messages/:userId", privateChat.getPrivateMessages);

// POST /api/private-chat/send -> Save new message to DB
router.post("/send", privateChat.sendPrivateMessage);

// PUT /api/private-chat/update/:id -> Edit an existing message
router.put("/update/:id", privateChat.updatePrivateMessage); 

// DELETE /api/private-chat/delete/:id -> Hide message for user
router.delete("/delete/:id", privateChat.deletePrivateMessage);

module.exports = router;