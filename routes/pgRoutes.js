const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const controller = require("../controllers/pgController");
const auth = require("../middlewares/auth");
const db = require("../db");

const router = express.Router();

/* =================================================
   UPLOAD DIRECTORIES
================================================= */
const photoDir = path.join(__dirname, "..", "uploads", "pg-photos");
const videoDir = path.join(__dirname, "..", "uploads", "pg-videos");

if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });
if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

/* =================================================
   MULTER CONFIG
================================================= */
const photoStorage = multer.diskStorage({
  destination: photoDir,
  filename: (req, file, cb) => {
    cb(null, `pg-photo-${Date.now()}-${Math.random() * 1e9}${path.extname(file.originalname)}`);
  },
});

const videoStorage = multer.diskStorage({
  destination: videoDir,
  filename: (req, file, cb) => {
    cb(null, `pg-video-${Date.now()}-${Math.random() * 1e9}${path.extname(file.originalname)}`);
  },
});

const uploadPhotos = multer({ storage: photoStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadVideos = multer({ storage: videoStorage, limits: { fileSize: 50 * 1024 * 1024 } });

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
   PHOTOS
================================================= */

router.put("/:id/photos", auth, uploadPhotos.array("photos", 10), controller.uploadPhotosOnly);
router.delete("/:id/photo", auth, controller.deleteSinglePhoto);
router.put("/:id/photos/order", auth, controller.updatePhotoOrder);

/* =================================================
   VIDEOS
================================================= */

router.post("/:id/videos", auth, uploadVideos.array("videos", 5), controller.uploadPGVideos);
router.delete("/:id/video", auth, controller.deleteSingleVideo);

/* =================================================
   STATUS & DELETE
================================================= */

router.patch("/:id/status", auth, controller.updatePGStatus);
router.delete("/:id", auth, controller.deletePG);

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
