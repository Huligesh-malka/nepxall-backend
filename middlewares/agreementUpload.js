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
    const isPDF = file.mimetype === "application/pdf";
    const publicId = `agreement-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    // Logic for PDFs
    if (isPDF) {
      return {
        folder: "agreements",
        resource_type: "raw", // CRITICAL: Treat PDF as a document, not an image
        public_id: publicId,
        format: "pdf",
      };
    }

    // Logic for Images (Aadhaar, PAN, Signatures)
    return {
      folder: "agreements",
      resource_type: "image",
      public_id: publicId,
      transformation: [
        { width: 1600, crop: "limit", quality: "auto", fetch_format: "auto" }
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
    "application/pdf"
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG, or PDF files are allowed"), false);
  }
};

/* ================= MULTER CONFIG ================= */
const uploadAgreement = multer({
  storage: agreementStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter
});

module.exports = uploadAgreement;