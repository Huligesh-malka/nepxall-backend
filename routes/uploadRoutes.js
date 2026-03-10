const express = require("express");
const router = express.Router();
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const controller = require("../controllers/uploadController");

// Configure Cloudinary storage for photos
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "pg-photos",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
    transformation: [{ width: 1200, height: 800, crop: "limit" }],
    public_id: (req, file) => {
      // Generate unique filename with PG ID for better organization
      const { pgId } = req.params;
      return `pg-${pgId}-photo-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    },
  },
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Upload multiple photos for a specific PG
router.post("/:pgId/upload-photos", upload.array("photos", 10), controller.uploadPGPhotos);

// Get all photos for a PG
router.get("/:pgId/photos", controller.getPGPhotos);

// Delete a specific photo
router.delete("/:pgId/photo", controller.deletePGPhoto);

// Reorder photos
router.put("/:pgId/photos/order", controller.reorderPGPhotos);

// Legacy single photo endpoints (keeping for backward compatibility)
router.post("/:pgId/photo", upload.single("photo"), controller.uploadPGPhoto);
router.get("/:pgId/photo", controller.getPGPhoto);

module.exports = router;