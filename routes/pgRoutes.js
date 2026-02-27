const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

const controller = require("../controllers/pgController");
const auth = require("../middlewares/auth");
const db = require("../db");

const router = express.Router();

/* =================================================
   CLOUDINARY STORAGE CONFIG
================================================= */

// Configure Cloudinary storage for photos
const photoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "pg-photos",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
    transformation: [{ width: 1200, height: 800, crop: "limit" }],
    public_id: (req, file) => {
      return `pg-photo-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    },
  },
});

// Configure Cloudinary storage for videos
const videoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "pg-videos",
    allowed_formats: ["mp4", "mov", "avi", "webm"],
    resource_type: "video",
    transformation: [{ width: 1280, crop: "limit" }],
    public_id: (req, file) => {
      return `pg-video-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    },
  },
});

const uploadPhotos = multer({ 
  storage: photoStorage, 
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const uploadVideos = multer({ 
  storage: videoStorage, 
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

/* =================================================
   OWNER ROUTES
================================================= */

router.get("/owner/dashboard", auth, controller.getOwnerDashboardPGs);

/* =================================================
   ADD / UPDATE
================================================= */

router.post("/add", auth, uploadPhotos.array("photos", 10), controller.addPG);
router.put("/:id", auth, uploadPhotos.array("photos", 10), controller.updatePG);

/* =================================================
   PHOTOS - Cloudinary endpoints
================================================= */

// Upload photos only (returns Cloudinary URLs)
router.post("/:id/upload-photos", auth, uploadPhotos.array("photos", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No photos uploaded"
      });
    }

    // Get Cloudinary URLs from uploaded files
    const photoUrls = req.files.map(file => file.path);

    // Get current photos from database
    const [pg] = await db.query("SELECT photos FROM pg WHERE id = ?", [req.params.id]);
    
    let existingPhotos = [];
    if (pg[0]?.photos) {
      try {
        existingPhotos = JSON.parse(pg[0].photos);
      } catch (e) {
        existingPhotos = [];
      }
    }

    // Combine existing and new photos
    const updatedPhotos = [...existingPhotos, ...photoUrls];

    // Update database
    await db.query(
      "UPDATE pg SET photos = ? WHERE id = ?",
      [JSON.stringify(updatedPhotos), req.params.id]
    );

    res.json({
      success: true,
      message: "Photos uploaded successfully",
      photos: photoUrls,
      allPhotos: updatedPhotos
    });
  } catch (error) {
    console.error("Error uploading photos:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload photos"
    });
  }
});

// Backup endpoint for backward compatibility
router.put("/:id/photos", auth, uploadPhotos.array("photos", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No photos uploaded"
      });
    }

    const photoUrls = req.files.map(file => file.path);

    await db.query(
      "UPDATE pg SET photos = ? WHERE id = ?",
      [JSON.stringify(photoUrls), req.params.id]
    );

    res.json({
      success: true,
      message: "Photos updated successfully",
      photos: photoUrls
    });
  } catch (error) {
    console.error("Error updating photos:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update photos"
    });
  }
});

// Delete single photo from Cloudinary and database
router.delete("/:id/photo", auth, async (req, res) => {
  try {
    const { photoUrl } = req.body;

    if (!photoUrl) {
      return res.status(400).json({
        success: false,
        message: "Photo URL required"
      });
    }

    // Extract public_id from Cloudinary URL
    // URL format: https://res.cloudinary.com/cloud_name/image/upload/v123456/folder/public_id.jpg
    const urlParts = photoUrl.split('/');
    const publicIdWithExtension = urlParts[urlParts.length - 1];
    const publicId = `pg-photos/${publicIdWithExtension.split('.')[0]}`;

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (cloudinaryError) {
      console.error("Error deleting from Cloudinary:", cloudinaryError);
      // Continue even if Cloudinary delete fails
    }

    // Get current photos from database
    const [pg] = await db.query("SELECT photos FROM pg WHERE id = ?", [req.params.id]);
    
    let existingPhotos = [];
    if (pg[0]?.photos) {
      try {
        existingPhotos = JSON.parse(pg[0].photos);
      } catch (e) {
        existingPhotos = [];
      }
    }

    // Remove the photo
    const updatedPhotos = existingPhotos.filter(url => url !== photoUrl);

    // Update database
    await db.query(
      "UPDATE pg SET photos = ? WHERE id = ?",
      [JSON.stringify(updatedPhotos), req.params.id]
    );

    res.json({
      success: true,
      message: "Photo deleted successfully",
      photos: updatedPhotos
    });
  } catch (error) {
    console.error("Error deleting photo:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete photo"
    });
  }
});

// Update photo order
router.put("/:id/photos/order", auth, async (req, res) => {
  try {
    const { photos } = req.body;

    if (!photos || !Array.isArray(photos)) {
      return res.status(400).json({
        success: false,
        message: "Photos array required"
      });
    }

    await db.query(
      "UPDATE pg SET photos = ? WHERE id = ?",
      [JSON.stringify(photos), req.params.id]
    );

    res.json({
      success: true,
      message: "Photo order updated successfully"
    });
  } catch (error) {
    console.error("Error updating photo order:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update photo order"
    });
  }
});

/* =================================================
   VIDEOS
================================================= */

// Upload videos
router.post("/:id/videos", auth, uploadVideos.array("videos", 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No videos uploaded"
      });
    }

    const videoUrls = req.files.map(file => file.path);

    // Get current videos from database
    const [pg] = await db.query("SELECT videos FROM pg WHERE id = ?", [req.params.id]);
    
    let existingVideos = [];
    if (pg[0]?.videos) {
      try {
        existingVideos = JSON.parse(pg[0].videos);
      } catch (e) {
        existingVideos = [];
      }
    }

    const updatedVideos = [...existingVideos, ...videoUrls];

    await db.query(
      "UPDATE pg SET videos = ? WHERE id = ?",
      [JSON.stringify(updatedVideos), req.params.id]
    );

    res.json({
      success: true,
      message: "Videos uploaded successfully",
      videos: videoUrls
    });
  } catch (error) {
    console.error("Error uploading videos:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload videos"
    });
  }
});

// Delete single video
router.delete("/:id/video", auth, async (req, res) => {
  try {
    const { videoUrl } = req.body;

    if (!videoUrl) {
      return res.status(400).json({
        success: false,
        message: "Video URL required"
      });
    }

    // Extract public_id from Cloudinary URL for videos
    const urlParts = videoUrl.split('/');
    const publicIdWithExtension = urlParts[urlParts.length - 1];
    const publicId = `pg-videos/${publicIdWithExtension.split('.')[0]}`;

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
    } catch (cloudinaryError) {
      console.error("Error deleting from Cloudinary:", cloudinaryError);
    }

    // Get current videos from database
    const [pg] = await db.query("SELECT videos FROM pg WHERE id = ?", [req.params.id]);
    
    let existingVideos = [];
    if (pg[0]?.videos) {
      try {
        existingVideos = JSON.parse(pg[0].videos);
      } catch (e) {
        existingVideos = [];
      }
    }

    const updatedVideos = existingVideos.filter(url => url !== videoUrl);

    await db.query(
      "UPDATE pg SET videos = ? WHERE id = ?",
      [JSON.stringify(updatedVideos), req.params.id]
    );

    res.json({
      success: true,
      message: "Video deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting video:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete video"
    });
  }
});

/* =================================================
   STATUS & DELETE
================================================= */

router.patch("/:id/status", auth, controller.updatePGStatus);

// Delete entire PG
router.delete("/:id", auth, async (req, res) => {
  try {
    // Get photos and videos before deleting
    const [pg] = await db.query("SELECT photos, videos FROM pg WHERE id = ?", [req.params.id]);
    
    if (pg[0]) {
      // Delete photos from Cloudinary
      if (pg[0].photos) {
        try {
          const photos = JSON.parse(pg[0].photos);
          for (const photoUrl of photos) {
            const urlParts = photoUrl.split('/');
            const publicIdWithExtension = urlParts[urlParts.length - 1];
            const publicId = `pg-photos/${publicIdWithExtension.split('.')[0]}`;
            await cloudinary.uploader.destroy(publicId).catch(() => {});
          }
        } catch (e) {}
      }

      // Delete videos from Cloudinary
      if (pg[0].videos) {
        try {
          const videos = JSON.parse(pg[0].videos);
          for (const videoUrl of videos) {
            const urlParts = videoUrl.split('/');
            const publicIdWithExtension = urlParts[urlParts.length - 1];
            const publicId = `pg-videos/${publicIdWithExtension.split('.')[0]}`;
            await cloudinary.uploader.destroy(publicId, { resource_type: "video" }).catch(() => {});
          }
        } catch (e) {}
      }
    }

    // Delete from database
    await db.query("DELETE FROM pg WHERE id = ?", [req.params.id]);

    res.json({
      success: true,
      message: "PG deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting PG:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete PG"
    });
  }
});

/* =================================================
   PUBLIC ROUTES
================================================= */

router.get("/nearby/:lat/:lng", controller.getNearbyPGs);
router.get("/search/advanced", controller.advancedSearchPG);

/* =================================================
   USER HELPERS (CHAT etc)
================================================= */

router.get("/user/:firebaseUid", auth, controller.getUserByFirebaseUid);

router.get("/user-by-id/:id", auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name FROM users WHERE id = ?",
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =================================================
   🔥 ALWAYS KEEP THIS LAST
================================================= */

router.get("/:id", controller.getPGById);

/* =================================================
   MULTER ERROR HANDLER
================================================= */

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: err.code === "LIMIT_FILE_SIZE" ? "File too large" : "File upload error",
    });
  }
  next(err);
});

module.exports = router;