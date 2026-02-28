const express = require("express");
const router = express.Router();

const privateChat = require("../controllers/privateChatController");
const auth = require("../middlewares/auth");

/* =========================================================
   🔐 ALL PRIVATE CHAT ROUTES REQUIRE AUTH
========================================================= */
router.use(auth);

/* =========================================================
   👤 USER & CHAT LIST
========================================================= */

/**
 * @route   GET /api/private-chat/me
 * @desc    Get logged-in user (MySQL mapped from Firebase)
 */
router.get("/me", privateChat.getMe);

/**
 * @route   GET /api/private-chat/list
 * @desc    Get chat list (owner + tenant safe)
 */
router.get("/list", privateChat.getMyChatList);

/**
 * @route   GET /api/private-chat/user/:id
 * @desc    Get other user basic info
 */
router.get("/user/:id", privateChat.getUserById);


/* =========================================================
   💬 MESSAGES
========================================================= */

/**
 * @route   GET /api/private-chat/messages/:userId
 * @desc    Get full conversation with a user
 */
router.get("/messages/:userId", privateChat.getPrivateMessages);

/**
 * @route   POST /api/private-chat/send
 * @desc    Send a new message
 */
router.post("/send", privateChat.sendPrivateMessage);

/**
 * @route   PUT /api/private-chat/update/:id
 * @desc    Edit message (only sender)
 */
router.put("/update/:id", privateChat.updatePrivateMessage);

/**
 * @route   DELETE /api/private-chat/delete/:id
 * @desc    Soft delete message (sender/receiver)
 */
router.delete("/delete/:id", privateChat.deletePrivateMessage);


/* =========================================================
   🚫 404 HANDLER FOR THIS ROUTER
========================================================= */
router.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Private chat route not found → ${req.originalUrl}`,
  });
});

module.exports = router;