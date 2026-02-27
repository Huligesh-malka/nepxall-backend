const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

/* ================= CLOUDINARY CONFIG ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= PHOTO STORAGE ================= */
const photoStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const ext = file.mimetype.split("/")[1];

    return {
      folder: "pg-photos",
      public_id: `pg-photo-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      resource_type: "image",
      format: ext,
      transformation: [
        {
          width: 1200,
          height: 800,
          crop: "limit",
          quality: "auto",
          fetch_format: "auto",
        },
      ],
    };
  },
});

/* ================= VIDEO STORAGE ================= */
const videoStorage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: "pg-videos",
    resource_type: "video",
    public_id: `pg-video-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
    transformation: [{ width: 1280, crop: "limit" }],
  }),
});

/* ================= MULTER ================= */

const uploadPhotos = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"), false);
    }
    cb(null, true);
  },
});

const uploadVideos = multer({
  storage: videoStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("video/")) {
      return cb(new Error("Only video files are allowed"), false);
    }
    cb(null, true);
  },
});

module.exports = {
  cloudinary,
  uploadPhotos,
  uploadVideos,
};