const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

/* ================= CLOUDINARY CONFIG ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= COMMON PARAMS ================= */
const createStorage = (folderName) =>
  new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const ext = file.mimetype.split("/")[1];

      return {
        folder: `nepxall/${folderName}`, // 🔥 structured folders
        format: ext,
        public_id: `${folderName}-${Date.now()}-${Math.round(
          Math.random() * 1e9
        )}`,
        transformation: [
          { width: 1200, crop: "limit", quality: "auto" },
        ],
      };
    },
  });

/* ================= FILE FILTER ================= */
const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only JPG, PNG, WEBP allowed"), false);
  }

  cb(null, true);
};

/* ================= MULTER FACTORY ================= */
const createUploader = (folder) =>
  multer({
    storage: createStorage(folder),
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  });

/* ================= EXPORTS ================= */

exports.uploadPGPhotos = createUploader("pg-photos");

exports.uploadRoomPhotos = createUploader("room-photos");

exports.uploadKycDocs = createUploader("kyc");

exports.uploadProfile = createUploader("profile");

/* ================= DELETE FROM CLOUDINARY ================= */
exports.deleteFromCloudinary = async (url) => {
  try {
    if (!url) return;

    const parts = url.split("/");
    const file = parts[parts.length - 1];
    const publicId = file.split(".")[0];

    await cloudinary.uploader.destroy(`nepxall/${publicId}`);
  } catch (err) {
    console.log("Cloudinary delete failed:", err.message);
  }
};

module.exports.cloudinary = cloudinary;