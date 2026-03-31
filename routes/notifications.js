const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/:firebase_uid", (req, res) => {
  const { firebase_uid} = req.params;

  db.query(
    `SELECT id FROM users WHERE firebase_uid = ?`,
    [firebase_uid],
    (err, rows) => {
      if (err || !rows.length) {
        return res.json({ success: true, data: [] });
      }

      const userId = rows[0].id;

      db.query(
        `SELECT * FROM notifications
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [userId],
        (err2, notifications) => {
          res.json({ success: true, data: notifications });
        }
      );
    }
  );
});

module.exports = router;
