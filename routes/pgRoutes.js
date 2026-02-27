const express = require("express");
const multer = require("multer");
const router = express.Router();

const controller = require("../controllers/pgController");
const auth = require("../middlewares/auth");
const db = require("../db");

const { uploadPhotos, uploadVideos } = require("../middlewares/upload");

/* =================================================
   HELPER → SAFE JSON PARSE
================================================= */
const parseJSON = (data) => {
  try {
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

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
   ✅ UPLOAD PHOTOS (USED BY FRONTEND)
   POST /api/pg/:id/upload-photos
================================================= */
router.post("/:id/upload-photos", auth, uploadPhotos.array("photos", 10), async (req, res) => {
  try {
    const newPhotos = req.files.map((file) => file.path);

    const [rows] = await db.query(
      "SELECT photos FROM pgs WHERE id = ?",
      [req.params.id]
    );

    const existingPhotos = parseJSON(rows[0]?.photos);

    const updatedPhotos = [...existingPhotos, ...newPhotos];

    await db.query(
      "UPDATE pgs SET photos = ? WHERE id = ?",
      [JSON.stringify(updatedPhotos), req.params.id]
    );

    res.json({
      success: true,
      message: "Photos uploaded successfully",
      photos: updatedPhotos,
    });
  } catch (err) {
    console.error("UPLOAD PHOTO ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* =================================================
   UPDATE PHOTO ORDER
================================================= */
router.put("/:id/photos/order", auth, controller.updatePhotoOrder);

/* =================================================
   DELETE SINGLE PHOTO
================================================= */
router.delete("/:id/photo", auth, controller.deleteSinglePhoto);

/* =================================================
   VIDEOS
================================================= */
router.post("/:id/videos", auth, uploadVideos.array("videos", 5), async (req, res) => {
  try {
    const newVideos = req.files.map((file) => file.path);

    const [rows] = await db.query(
      "SELECT videos FROM pgs WHERE id = ?",
      [req.params.id]
    );

    const existingVideos = parseJSON(rows[0]?.videos);

    const updatedVideos = [...existingVideos, ...newVideos];

    await db.query(
      "UPDATE pgs SET videos = ? WHERE id = ?",
      [JSON.stringify(updatedVideos), req.params.id]
    );

    res.json({
      success: true,
      message: "Videos uploaded successfully",
      videos: updatedVideos,
    });
  } catch (err) {
    console.error("UPLOAD VIDEO ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/:id/video", auth, controller.deleteSingleVideo);

/* =================================================
   STATUS & DELETE PG
================================================= */
router.patch("/:id/status", auth, controller.updatePGStatus);
router.delete("/:id", auth, controller.deletePG);

/* =================================================
   PUBLIC ROUTES
================================================= */
router.get("/nearby/:lat/:lng", controller.getNearbyPGs);
router.get("/search/advanced", controller.advancedSearchPG);

/* =================================================
   USER HELPERS
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
  } catch {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =================================================
   🔥 KEEP LAST
================================================= */
router.get("/:id", controller.getPGById);

/* =================================================
   MULTER ERROR HANDLER
================================================= */
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message:
        err.code === "LIMIT_FILE_SIZE"
          ? "File too large (max 5MB)"
          : "File upload error",
    });
  }
  next(err);
});

module.exports = router;,,,,,,,,,,,,