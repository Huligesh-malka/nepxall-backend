const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const controller = require("../controllers/uploadController");

const storage = multer.diskStorage({
  destination: "uploads/photos",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

router.post("/:pgId/photo", upload.single("photo"), controller.uploadPGPhoto);
router.get("/:pgId/photo", controller.getPGPhoto);

module.exports = router;
