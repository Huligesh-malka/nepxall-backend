const db = require("../db");

//////////////////////////////////////////////////////
// 🔥 SAVE FCM TOKEN
//////////////////////////////////////////////////////
exports.saveFcmToken = async (req, res) => {

  try {

    const userId = req.user.id;

    const { token } = req.body;

    if (!token) {

      return res.status(400).json({
        message: "Token required"
      });

    }

    await db.query(

      "UPDATE users SET fcm_token=? WHERE id=?",

      [token, userId]

    );

    res.json({
      success: true,
      message: "FCM token saved"
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: err.message
    });

  }

};