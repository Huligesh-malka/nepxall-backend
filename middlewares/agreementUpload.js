const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

/* ================= CLOUDINARY CONFIG ================= */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= AGREEMENT STORAGE ================= */

const agreementStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {

    let folder = "agreements";

    if (
      file.fieldname === "aadhaar_front" ||
      file.fieldname === "aadhaar_back"
    ) {
      folder = "agreements/aadhaar";
    }

    if (file.fieldname === "pan_card") {
      folder = "agreements/pan";
    }

    if (file.fieldname === "signature") {
      folder = "agreements/signature";
    }

    return {
      folder,
      resource_type: "image",
      public_id: `agreement-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      transformation: [
        {
          width: 1200,
          crop: "limit",
          quality: "auto",
          fetch_format: "auto",
        },
      ],
    };
  },
});

/* ================= MULTER ================= */

const uploadAgreement = multer({
  storage: agreementStorage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {

    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files allowed"), false);
    }

    cb(null, true);
  },
});

module.exports = uploadAgreement;