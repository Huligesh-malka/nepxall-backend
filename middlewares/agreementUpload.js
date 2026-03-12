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

    if (file.fieldname === "aadhaar_front" || file.fieldname === "aadhaar_back") {
      folder = "agreements/aadhaar";
    } else if (file.fieldname === "pan_card") {
      folder = "agreements/pan";
    } else if (file.fieldname === "signature") {
      folder = "agreements/signature";
    }

    return {
      folder,
      resource_type: "auto", // CHANGED: 'auto' allows images AND pdfs
      public_id: `agreement-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      // Note: Transformations only apply to images. 
      // Cloudinary will ignore these for PDF files automatically.
      transformation: file.mimetype.startsWith("image/") 
        ? [{ width: 1200, crop: "limit", quality: "auto", fetch_format: "auto" }] 
        : [],
    };
  },
});

/* ================= MULTER ================= */
const uploadAgreement = multer({
  storage: agreementStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Increased to 10MB to handle larger PDFs
  },
  fileFilter: (req, file, cb) => {
    // UPDATED: Added application/pdf
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (JPG/PNG) or PDFs are allowed"), false);
    }
  },
});

module.exports = uploadAgreement;