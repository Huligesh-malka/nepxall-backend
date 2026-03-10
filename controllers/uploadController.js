const db = require("../db");

exports.uploadPGPhotos = (req, res) => {
  const { id } = req.params;
  const replaceFirst = req.body.replaceFirst === "true";

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No files uploaded"
    });
  }

  const newPhotos = req.files.map(
    (file) => `/uploads/photos/${file.filename}`
  );

  db.query("SELECT photos FROM pgs WHERE id = ?", [id], (err, rows) => {
    if (err || rows.length === 0) {
      return res.status(500).json({ success: false });
    }

    let photos = rows[0].photos || [];

    if (typeof photos === "string") {
      photos = JSON.parse(photos);
    }

    if (replaceFirst && photos.length > 0) {
      photos[0] = newPhotos[0];

      if (newPhotos.length > 1) {
        photos.push(...newPhotos.slice(1));
      }

    } else {
      photos.push(...newPhotos);
    }

    db.query(
      "UPDATE pgs SET photos = ? WHERE id = ?",
      [JSON.stringify(photos), id],
      (err) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ success: false });
        }

        res.json({
          success: true,
          photos
        });
      }
    );
  });
};




exports.getPGPhotos = (req, res) => {
  const { id } = req.params;

  db.query(
    "SELECT photos FROM pgs WHERE id = ?",
    [id],
    (err, rows) => {
      if (err || rows.length === 0) {
        return res.json({ success: true, photos: [] });
      }

      let photos = rows[0].photos || [];

      if (typeof photos === "string") {
        photos = JSON.parse(photos);
      }

      res.json({
        success: true,
        photos
      });
    }
  );
};



exports.deletePGPhoto = (req, res) => {
  const { id } = req.params;
  const { photo } = req.body;

  db.query(
    "SELECT photos FROM pgs WHERE id = ?",
    [id],
    (err, rows) => {

      let photos = rows[0].photos || [];

      if (typeof photos === "string") {
        photos = JSON.parse(photos);
      }

      photos = photos.filter(p => p !== photo);

      db.query(
        "UPDATE pgs SET photos = ? WHERE id = ?",
        [JSON.stringify(photos), id],
        (err) => {
          if (err) return res.status(500).json({ success: false });

          res.json({
            success: true,
            photos
          });
        }
      );
    }
  );
};