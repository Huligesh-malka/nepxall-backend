const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middlewares/authMiddleware");

const {
  saveFcmToken
} = require("../controllers/notificationController");

//////////////////////////////////////////////////////
// 🔥 SAVE FCM TOKEN
//////////////////////////////////////////////////////
router.post(
  "/save-fcm-token",
  authMiddleware,
  saveFcmToken
);

module.exports = router;