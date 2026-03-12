const express = require("express");
const router = express.Router();
const multer = require("multer");

const agreementsFormController = require("../controllers/agreementsFormController");

const storage = multer.diskStorage({

destination: function (req, file, cb) {

if (file.fieldname === "aadhaar_front" || file.fieldname === "aadhaar_back") {
cb(null, "uploads/aadhaar/");
}

else if (file.fieldname === "pan_card") {
cb(null, "uploads/pan/");
}

else if (file.fieldname === "signature") {
cb(null, "uploads/signature/");
}

},

filename: function (req, file, cb) {
cb(null, Date.now() + "-" + file.originalname);
}

});

const upload = multer({ storage });

router.post(
"/submit",
upload.fields([
{ name: "aadhaar_front", maxCount: 1 },
{ name: "aadhaar_back", maxCount: 1 },
{ name: "pan_card", maxCount: 1 },
{ name: "signature", maxCount: 1 }
]),
agreementsFormController.submitAgreementForm
);

module.exports = router;