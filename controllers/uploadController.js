const db = require("../db");
const cloudinary = require("cloudinary").v2;

/* ===============================
   UPLOAD MULTIPLE PG PHOTOS
================================ */
exports.uploadPGPhotos = (req, res) => {
  const { pgId } = req.params;
  const { replaceFirst } = req.body; // Get the replaceFirst flag

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: "No files uploaded" });
  }

  // Extract Cloudinary URLs from uploaded files
  const newPhotoUrls = req.files.map(file => file.path); // Cloudinary URL is in file.path

  // First, get existing photos from database
  db.query(
    "SELECT photos FROM pgs WHERE id = ?",
    [pgId],
    (err, rows) => {
      if (err) {
        console.error("Error fetching existing photos:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }

      let existingPhotos = [];
      if (rows.length > 0 && rows[0].photos) {
        try {
          // Parse photos if they're stored as JSON string, or use as is
          existingPhotos = typeof rows[0].photos === 'string' 
            ? JSON.parse(rows[0].photos) 
            : rows[0].photos || [];
        } catch (e) {
          console.error("Error parsing photos:", e);
          existingPhotos = [];
        }
      }

      let updatedPhotos = [];

      // Check if replaceFirst is 'true' (form data sends strings)
      if (replaceFirst === 'true' && existingPhotos.length > 0) {
        // Replace first image with the first uploaded image
        // Keep the rest of the existing photos (except first)
        const remainingExisting = existingPhotos.slice(1);
        
        // First uploaded image replaces position 0
        // Remaining uploaded images are appended
        updatedPhotos = [
          newPhotoUrls[0],  // First new image at position 0
          ...remainingExisting,  // Rest of existing photos (excluding first)
          ...newPhotoUrls.slice(1)  // Remaining new images appended
        ];

        // Delete the old first image from Cloudinary (optional)
        if (existingPhotos.length > 0 && existingPhotos[0]) {
          const oldPhotoUrl = existingPhotos[0];
          // Extract public_id from Cloudinary URL
          const publicId = extractPublicIdFromUrl(oldPhotoUrl);
          if (publicId) {
            cloudinary.uploader.destroy(publicId, (err, result) => {
              if (err) console.error("Error deleting old photo from Cloudinary:", err);
              else console.log("Old photo deleted from Cloudinary:", result);
            });
          }
        }
      } else {
        // Normal behavior: append all new photos
        updatedPhotos = [...existingPhotos, ...newPhotoUrls];
      }

      // Store as JSON in the database
      db.query(
        "UPDATE pgs SET photos = ? WHERE id = ?",
        [JSON.stringify(updatedPhotos), pgId],
        (err) => {
          if (err) {
            console.error("Error updating photos:", err);
            return res.status(500).json({ success: false, message: "Failed to save photos" });
          }

          res.json({
            success: true,
            message: replaceFirst === 'true' ? "First photo replaced successfully" : "Photos uploaded successfully",
            photos: updatedPhotos,
            replaceFirst: replaceFirst === 'true'
          });
        }
      );
    }
  );
};

/* ===============================
   GET PG PHOTOS
================================ */
exports.getPGPhotos = (req, res) => {
  const { pgId } = req.params;

  db.query(
    "SELECT photos FROM pgs WHERE id = ?",
    [pgId],
    (err, rows) => {
      if (err) {
        console.error("Error fetching photos:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }

      let photos = [];
      if (rows.length > 0 && rows[0].photos) {
        try {
          photos = typeof rows[0].photos === 'string' 
            ? JSON.parse(rows[0].photos) 
            : rows[0].photos || [];
        } catch (e) {
          console.error("Error parsing photos:", e);
          photos = [];
        }
      }

      res.json({
        success: true,
        photos: photos
      });
    }
  );
};

/* ===============================
   DELETE PG PHOTO
================================ */
exports.deletePGPhoto = (req, res) => {
  const { pgId } = req.params;
  const { photo } = req.body; // The Cloudinary URL or path

  if (!photo) {
    return res.status(400).json({ success: false, message: "Photo URL required" });
  }

  // Get current photos
  db.query(
    "SELECT photos FROM pgs WHERE id = ?",
    [pgId],
    (err, rows) => {
      if (err || rows.length === 0) {
        return res.status(404).json({ success: false, message: "PG not found" });
      }

      let photos = [];
      try {
        photos = typeof rows[0].photos === 'string' 
          ? JSON.parse(rows[0].photos) 
          : rows[0].photos || [];
      } catch (e) {
        console.error("Error parsing photos:", e);
        photos = [];
      }

      // Check if photo exists in the array
      if (!photos.includes(photo)) {
        return res.status(404).json({ success: false, message: "Photo not found" });
      }

      // Filter out the deleted photo
      const updatedPhotos = photos.filter(p => p !== photo);

      // Try to delete the file from Cloudinary
      const publicId = extractPublicIdFromUrl(photo);
      if (publicId) {
        cloudinary.uploader.destroy(publicId, (err, result) => {
          if (err) {
            console.error("Error deleting from Cloudinary:", err);
            // Continue even if Cloudinary delete fails
          } else {
            console.log("Deleted from Cloudinary:", result);
          }
        });
      }

      // Update database
      db.query(
        "UPDATE pgs SET photos = ? WHERE id = ?",
        [JSON.stringify(updatedPhotos), pgId],
        (err) => {
          if (err) {
            console.error("Error updating photos:", err);
            return res.status(500).json({ success: false, message: "Failed to delete photo" });
          }

          res.json({
            success: true,
            message: "Photo deleted successfully",
            photos: updatedPhotos
          });
        }
      );
    }
  );
};

/* ===============================
   REORDER PG PHOTOS
================================ */
exports.reorderPGPhotos = (req, res) => {
  const { pgId } = req.params;
  const { photos } = req.body;

  if (!photos || !Array.isArray(photos)) {
    return res.status(400).json({ success: false, message: "Invalid photos data" });
  }

  db.query(
    "UPDATE pgs SET photos = ? WHERE id = ?",
    [JSON.stringify(photos), pgId],
    (err) => {
      if (err) {
        console.error("Error reordering photos:", err);
        return res.status(500).json({ success: false, message: "Failed to reorder photos" });
      }

      res.json({
        success: true,
        message: "Photos reordered successfully",
        photos: photos
      });
    }
  );
};

/* ===============================
   LEGACY: SINGLE PHOTO UPLOAD (for backward compatibility)
================================ */
exports.uploadPGPhoto = (req, res) => {
  const { pgId } = req.params;

  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  const photoUrl = req.file.path; // Cloudinary URL

  // For backward compatibility, also update the old photo column
  // and append to the photos array
  db.query(
    "SELECT photos FROM pgs WHERE id = ?",
    [pgId],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false });
      }

      let photos = [];
      if (rows.length > 0 && rows[0].photos) {
        try {
          photos = typeof rows[0].photos === 'string' 
            ? JSON.parse(rows[0].photos) 
            : rows[0].photos || [];
        } catch (e) {
          photos = [];
        }
      }

      // Append new photo
      photos.push(photoUrl);

      db.query(
        "UPDATE pgs SET photo = ?, photos = ? WHERE id = ?",
        [photoUrl, JSON.stringify(photos), pgId],
        (err) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ success: false });
          }

          res.json({
            success: true,
            photo: photoUrl,
            photos: photos
          });
        }
      );
    }
  );
};

/* ===============================
   LEGACY: GET SINGLE PHOTO (for backward compatibility)
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

/* ===============================
   HELPER FUNCTION: Extract public_id from Cloudinary URL
================================ */
function extractPublicIdFromUrl(url) {
  if (!url) return null;
  
  try {
    // Cloudinary URL format: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/public_id.jpg
    const matches = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.(jpg|jpeg|png|gif|webp)$/i);
    if (matches && matches[1]) {
      return matches[1];
    }
    return null;
  } catch (e) {
    console.error("Error extracting public_id:", e);
    return null;
  }
}