const express = require("express");
const router = express.Router();

const pgChat = require("../controllers/pgChatController");
const auth = require("../middlewares/authMiddleware");

/* =========================================================
   🔐 FIREBASE AUTH → ATTACH req.user.mysqlId
========================================================= */
router.use(auth);

/* =========================================================
   🏠 PG COMMUNITY CHAT ROUTES
   BASE PATH → /api/pg-chat
========================================================= */

/* =========================================================
   📜 GET CHAT HISTORY
   GET /api/pg-chat/messages/:pgId
========================================================= */
router.get("/messages/:pgId", pgChat.getMessages);

/* =========================================================
   📤 SEND MESSAGE
   POST /api/pg-chat/send
========================================================= */
router.post("/send", pgChat.sendMessage);

/* =========================================================
   ✏️ EDIT MESSAGE
   PUT /api/pg-chat/update/:id
========================================================= */
router.put("/update/:id", pgChat.updateMessage);

/* =========================================================
   🗑️ DELETE MESSAGE
   DELETE /api/pg-chat/delete/:id
========================================================= */
router.delete("/delete/:id", pgChat.deleteMessage);

/* =========================================================
   🧪 OPTIONAL TEST ROUTE (REMOVE IN PROD IF YOU WANT)
========================================================= */
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "PG Chat API working ✅",
    user: req.user,
  });
});

module.exports = router;
