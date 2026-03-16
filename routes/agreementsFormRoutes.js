const express = require("express");
const router = express.Router();

const agreementsFormController = require("../controllers/agreementsFormController");
const uploadAgreement = require("../middlewares/agreementUpload");

/* ======================================================
   SUBMIT AGREEMENT FORM
   Handles multipart/form-data file uploads
====================================================== */

router.post(
  "/submit",
  (req, res, next) => {

    uploadAgreement.fields([
      { name: "aadhaar_front", maxCount: 1 },
      { name: "aadhaar_back", maxCount: 1 },
      { name: "pan_card", maxCount: 1 },
      { name: "signature", maxCount: 1 }
    ])(req, res, function (err) {

      if (err) {
        console.error("❌ Multer Upload Error:", err);

        return res.status(500).json({
          success: false,
          message: "File upload failed",
          error: err.message
        });
      }

      next();
    });

  },

  async (req, res) => {

    try {

      console.log("📥 Agreement submission received");
      console.log("BODY:", req.body);
      console.log("FILES:", Object.keys(req.files || {}));

      await agreementsFormController.submitAgreementForm(req, res);

    } catch (error) {

      console.error("❌ Agreement route error:", error);

      res.status(500).json({
        success: false,
        message: "Agreement form route failed",
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