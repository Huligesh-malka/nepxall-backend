// middlewares/upload.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

/* ===============================
   CONFIG
================================ */
const BASE_UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const PG_PHOTOS_DIR = path.join(BASE_UPLOAD_DIR, "pg-photos");

// Ensure folders exist
[BASE_UPLOAD_DIR, PG_PHOTOS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/* ===============================
   STORAGE
================================ */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PG_PHOTOS_DIR);
  },
  filename: (req, file, cb) => {
    const unique =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      "pg-photo-" + unique + path.extname(file.originalname)
    );
  }
});

/* ===============================
   FILE FILTER (IMAGES ONLY)
================================ */
const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;
  const isValid =
    allowed.test(file.mimetype) &&
    allowed.test(path.extname(file.originalname).toLowerCase());

  if (isValid) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

/* ===============================
   MULTER INSTANCE
================================ */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

module.exports = upload;
