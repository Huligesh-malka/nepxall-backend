const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

/* ================= CLOUDINARY CONFIG ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= STORAGE ================= */
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: "pg-photos",
      public_id: `pg-photo-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
      transformation: [{ width: 1200, height: 800, crop: "limit" }],
    };
  },
});

/* ================= MULTER ================= */
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

module.exports = upload;