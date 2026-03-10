const express = require("express");
const router = express.Router();
const { uploadPhotos } = require("../middleware/upload");
const controller = require("../controllers/uploadController");

// Upload multiple photos for a specific PG
router.post("/:pgId/upload-photos", uploadPhotos.array("photos", 10), (req, res, next) => {
  console.log("📸 Upload photos route hit:", { 
    pgId: req.params.pgId, 
    files: req.files?.length,
    body: req.body 
  });
  next();
}, controller.uploadPGPhotos);

// Get all photos for a PG
router.get("/:pgId/photos", controller.getPGPhotos);

// Delete a specific photo
router.delete("/:pgId/photo", controller.deletePGPhoto);

// Reorder photos
router.put("/:pgId/photos/order", controller.reorderPGPhotos);

// Legacy single photo endpoints (keeping for backward compatibility)
router.post("/:pgId/photo", uploadPhotos.single("photo"), controller.uploadPGPhoto);
router.get("/:pgId/photo", controller.getPGPhoto);

module.exports = router;