const express = require("express");
const router = express.Router();
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const controller = require("../controllers/uploadController");

// Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "pg-photos",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
    transformation: [{ width: 1200, height: 800, crop: "limit" }],
    public_id: () => {
      return `pg-photo-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    },
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/* ===============================
   UPLOAD MULTIPLE PHOTOS
================================ */

router.post("/:id/upload-photos", upload.array("photos", 15), controller.uploadPGPhotos);

/* ===============================
   GET PHOTOS
================================ */

router.get("/:id/photos", controller.getPGPhotos);

/* ===============================
   DELETE PHOTO
================================ */

router.delete("/:id/photo", controller.deletePGPhoto);

module.exports = router;