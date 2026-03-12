const express = require("express");
const router = express.Router();

const agreementsFormController = require("../controllers/agreementsFormController");
const uploadAgreement = require("../middlewares/agreementUpload");

/* ================= SUBMIT AGREEMENT FORM ================= */

router.post(
  "/submit",
  uploadAgreement.fields([
    { name: "aadhaar_front", maxCount: 1 },
    { name: "aadhaar_back", maxCount: 1 },
    { name: "pan_card", maxCount: 1 },
    { name: "signature", maxCount: 1 }
  ]),
  agreementsFormController.submitAgreementForm
);

/* ================= TEST ROUTE ================= */

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Agreement form route working"
  });
});

module.exports = router;