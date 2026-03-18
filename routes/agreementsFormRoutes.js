const express = require("express");
const router = express.Router();
const multer = require("multer");

const agreementsFormController = require("../controllers/agreementsFormController");
const uploadAgreement = require("../middlewares/agreementUpload");

/* ======================================================
   SUBMIT AGREEMENT FORM
====================================================== */

router.post(
  "/submit",
  (req, res, next) => {
    // Wrap the multer upload in a function to catch specific Multer/Cloudinary errors
    uploadAgreement.fields([
      { name: "aadhaar_front", maxCount: 1 },
      { name: "aadhaar_back", maxCount: 1 },
      { name: "pan_card", maxCount: 1 },
      { name: "signature", maxCount: 1 }
    ])(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      console.log("📥 Agreement submission received");
      
      // Ensure files were actually uploaded
      if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({
          success: false,
          message: "No files were uploaded. Please attach the required documents."
        });
      }

      // ✅ Call controller
      const result = await agreementsFormController.submitAgreementForm(req);

      console.log("✅ Controller finished successfully");

      // ✅ ALWAYS send response back to end the "Processing" state on frontend
      return res.status(200).json({
        success: true,
        message: "Agreement submitted and documents saved successfully",
        data: result || null
      });

    } catch (error) {
      console.error("❌ Agreement route error:", error);

      return res.status(500).json({
        success: false,
        message: "Internal server error during agreement submission",
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
    message: "Agreement form route is active"
  });
});

module.exports = router;