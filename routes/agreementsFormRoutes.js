const express = require("express");
const router = express.Router();

const agreementsFormController = require("../controllers/agreementsFormController");
const uploadAgreement = require("../middlewares/agreementUpload");

/* ======================================================
   SUBMIT AGREEMENT FORM (FIXED)
====================================================== */

router.post(
  "/submit",

  uploadAgreement.fields([
    { name: "aadhaar_front", maxCount: 1 },
    { name: "aadhaar_back", maxCount: 1 },
    { name: "pan_card", maxCount: 1 },
    { name: "signature", maxCount: 1 }
  ]),

  async (req, res) => {
    try {
      console.log("📥 Agreement submission received");

      console.log("BODY:", req.body);
      console.log("FILES:", req.files);

      // ✅ Call controller WITHOUT res
      const result = await agreementsFormController.submitAgreementForm(req);

      console.log("✅ Controller finished");

      // ✅ ALWAYS send response here
      return res.status(200).json({
        success: true,
        message: "Agreement submitted successfully",
        data: result || null
      });

    } catch (error) {
      console.error("❌ Agreement route error:", error);

      return res.status(500).json({
        success: false,
        message: "Agreement submission failed",
        error: error.message
      });
    }
  }
);

/* ======================================================
   TEST ROUTE
====================================================== */

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Agreement form route working"
  });
});

module.exports = router;