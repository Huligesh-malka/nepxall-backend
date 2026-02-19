// middlewares/uploadOwnerDocs.js
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: "uploads/owner-docs/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.fieldname + path.extname(file.originalname));
  }
});

module.exports = multer({ storage });
