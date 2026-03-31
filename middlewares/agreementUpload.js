const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

/* ================= CLOUDINARY CONFIG ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= STORAGE CONFIG ================= */
const agreementStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1e9);

    const publicId = `user-${req.user?.id || "guest"}-${timestamp}-${random}`;

    /* ================= PDF FILE ================= */
    if (file.mimetype === "application/pdf") {
      return {
        folder: "agreements/pdfs",
        resource_type: "raw", // ✅ FIXED
        public_id: publicId,
        format: "pdf",
      };
    }

    /* ================= IMAGE FILE ================= */
    return {
      folder: "agreements/images",
      resource_type: "image",
      public_id: publicId,
      transformation: [
        {
          width: 1600,
          crop: "limit",
          quality: "auto",
          fetch_format: "auto",
        },
      ],
    };
  },
});

/* ================= FILE FILTER ================= */
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/jpg",
    "application/pdf",
  ];

  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("Only JPG, PNG, or PDF files are allowed"), false);
  }

  cb(null, true);
};

/* ================= MULTER CONFIG ================= */
const uploadAgreement = multer({
  storage: agreementStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter,
});

module.exports = uploadAgreement;