const express = require("express");
const router = express.Router();

const agreementsFormController = require("../controllers/agreementsFormController");
const uploadAgreement = require("../middlewares/agreementUpload");

/* ================= SUBMIT AGREEMENT ================= */

router.post(
  "/submit",
  uploadAgreement.fields([
    { name: "aadhaar_front", maxCount: 1 },
    { name: "aadhaar_back", maxCount: 1 },
    { name: "pan_card", maxCount: 1 },
    { name: "signature", maxCount: 1 }
  ]),
  (req, res) => {
    try {

      console.log("📥 Agreement submission received");
      console.log("BODY:", req.body);
      console.log("FILES:", req.files);

      agreementsFormController.submitAgreementForm(req, res);

    } catch (error) {

      console.error("❌ Route error:", error);

      res.status(500).json({
        success: false,
        message: "Route /api/agreements-form/submit not properly configured"
      });

    }
  }
);

/* ================= TEST ROUTE ================= */

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Agreement route working"
  });
});

module.exports = router;