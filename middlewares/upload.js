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
  cloudinary,
  params: {
    folder: "pg-photos",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1200, crop: "limit" }],
    public_id: (req, file) =>
      "pg-photo-" + Date.now(),
  },
});

/* ================= FILE FILTER ================= */
const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;

  const isValid =
    allowed.test(file.mimetype) &&
    allowed.test(file.originalname.toLowerCase());

  if (isValid) cb(null, true);
  else cb(new Error("Only image files are allowed"), false);
};

/* ================= MULTER ================= */
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = upload;