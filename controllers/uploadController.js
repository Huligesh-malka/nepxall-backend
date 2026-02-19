const db = require("../db");

/* ===============================
   UPLOAD PG PHOTO (SINGLE)
================================ */
exports.uploadPGPhoto = (req, res) => {
  const { pgId } = req.params;

  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  const photoPath = `/uploads/photos/${req.file.filename}`;

  db.query(
    "UPDATE pgs SET photo = ? WHERE id = ?",
    [photoPath, pgId],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false });
      }

      res.json({
        success: true,
        photo: photoPath,
      });
    }
  );
};

/* ===============================
   GET PG PHOTO
================================ */
exports.getPGPhoto = (req, res) => {
  const { pgId } = req.params;

  db.query(
    "SELECT photo FROM pgs WHERE id = ?",
    [pgId],
    (err, rows) => {
      if (err || rows.length === 0) {
        return res.json({ success: true, photo: null });
      }

      res.json({
        success: true,
        photo: rows[0].photo,
      });
    }
  );
};
