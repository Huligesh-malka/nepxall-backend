const express = require("express");
const router = express.Router();
const db = require("../db");

// ✅ GET notifications by Firebase UID (DIRECT QUERY)
router.get("/:firebaseUid", (req, res) => {
  const { firebaseUid } = req.params;
  
  console.log(`📋 Fetching notifications for Firebase UID: ${firebaseUid}`);

  db.query(
    `SELECT * FROM notifications 
     WHERE user_id = ? 
     ORDER BY created_at DESC`,
    [firebaseUid],
    (err, data) => {
      if (err) {
        console.error("❌ Error fetching notifications:", err);
        return res.status(500).json({ 
          success: false, 
          message: "Failed to fetch notifications" 
        });
      }
      
      console.log(`✅ Found ${data.length} notifications for ${firebaseUid}`);
      res.json({ success: true, data });
    }
  );
});

// ✅ Mark notification as read
router.patch("/:id/read", (req, res) => {
  const { id } = req.params;
  
  db.query(
    "UPDATE notifications SET is_read = 1 WHERE id = ?",
    [id],
    (err, result) => {
      if (err) {
        console.error("❌ Error marking notification as read:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Notification not found" });
      }
      
      res.json({ success: true, message: "Marked as read" });
    }
  );
});

// ✅ Mark all notifications as read for a user
router.post("/mark-all-read", (req, res) => {
  const { user_id } = req.body;
  
  if (!user_id) {
    return res.status(400).json({ success: false, message: "User ID required" });
  }
  
  db.query(
    "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
    [user_id],
    (err, result) => {
      if (err) {
        console.error("❌ Error marking all as read:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }
      
      res.json({ 
        success: true, 
        message: "All notifications marked as read",
        affected: result.affectedRows 
      });
    }
  );
});

// ✅ Delete a notification
router.delete("/:id", (req, res) => {
  const { id } = req.params;
  
  db.query(
    "DELETE FROM notifications WHERE id = ?",
    [id],
    (err, result) => {
      if (err) {
        console.error("❌ Error deleting notification:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Notification not found" });
      }
      
      res.json({ success: true, message: "Notification deleted" });
    }
  );
});

module.exports = router;