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
    return {
      folder: "pg-photos",

      public_id: `pg-photo-${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}`,

      resource_type: "image",

      transformation: [
        {
          width: 1000,
          height: 700,
          crop: "limit",

          quality: "auto:good",

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

    public_id: `pg-video-${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}`,

    resource_type: "video",

    transformation: [
      {
        width: 960,
        crop: "limit",

        quality: "auto",

        fetch_format: "auto",
      },
    ],
  }),
});

/* ================= PHOTO UPLOAD ================= */

const uploadPhotos = multer({
  storage: photoStorage,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"), false);
    }

    cb(null, true);
  },
});

/* ================= VIDEO UPLOAD ================= */

const uploadVideos = multer({
  storage: videoStorage,

  limits: {
    fileSize: 15 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("video/")) {
      return cb(new Error("Only video files are allowed"), false);
    }

    cb(null, true);
  },
});

/* ================= EXPORTS ================= */

module.exports = {
  cloudinary,
  uploadPhotos,
  uploadVideos,
};