const express = require("express");
const router = express.Router();
const db = require("../db");
const auth = require("../middlewares/auth");
const controller = require("../controllers/pgController");

const {
  cloudinary,
  uploadPhotos,
  uploadVideos,
} = require("../middlewares/upload");

/* ================= OWNER DASHBOARD ================= */
router.get("/owner/dashboard", auth, controller.getOwnerDashboardPGs);

/* ================= ADD / UPDATE ================= */
router.post("/add", auth, uploadPhotos.array("photos", 10), controller.addPG);
router.put("/:id", auth, uploadPhotos.array("photos", 10), controller.updatePG);

/* ================= UPLOAD PHOTOS ================= */
router.post("/:id/upload-photos", auth, uploadPhotos.array("photos", 10), async (req, res) => {
  try {
    const photoUrls = req.files.map((file) => file.path);

    const [pg] = await db.query("SELECT photos FROM pg WHERE id=?", [req.params.id]);

    let existing = pg[0]?.photos ? JSON.parse(pg[0].photos) : [];

    const updated = [...existing, ...photoUrls];

    await db.query("UPDATE pg SET photos=? WHERE id=?", [
      JSON.stringify(updated),
      req.params.id,
    ]);

    res.json({ success: true, photos: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ================= DELETE PHOTO ================= */
router.delete("/:id/photo", auth, async (req, res) => {
  try {
    const { photoUrl } = req.body;

    const publicId = photoUrl
      .split("/upload/")[1]
      .split(".")[0];

    await cloudinary.uploader.destroy(publicId);

    const [pg] = await db.query("SELECT photos FROM pg WHERE id=?", [req.params.id]);

    const updated = JSON.parse(pg[0].photos).filter((p) => p !== photoUrl);

    await db.query("UPDATE pg SET photos=? WHERE id=?", [
      JSON.stringify(updated),
      req.params.id,
    ]);

    res.json({ success: true, photos: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ================= PHOTO ORDER ================= */
router.put("/:id/photos/order", auth, async (req, res) => {
  await db.query("UPDATE pg SET photos=? WHERE id=?", [
    JSON.stringify(req.body.photos),
    req.params.id,
  ]);

  res.json({ success: true });
});

/* ================= VIDEOS ================= */
router.post("/:id/videos", auth, uploadVideos.array("videos", 5), async (req, res) => {
  const videoUrls = req.files.map((file) => file.path);
  await db.query("UPDATE pg SET videos=? WHERE id=?", [
    JSON.stringify(videoUrls),
    req.params.id,
  ]);
  res.json({ success: true, videos: videoUrls });
});

/* ================= STATUS ================= */
router.patch("/:id/status", auth, controller.updatePGStatus);

/* ================= DELETE PG ================= */
router.delete("/:id", auth, async (req, res) => {
  await db.query("DELETE FROM pg WHERE id=?", [req.params.id]);
  res.json({ success: true });
});

/* ================= PUBLIC ================= */
router.get("/:id", controller.getPGById);

module.exports = router;