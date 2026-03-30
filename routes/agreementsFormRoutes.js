const express = require("express");
const router = express.Router();
const agreementsFormController = require("../controllers/agreementsFormController");
const uploadAgreement = require("../middlewares/agreementUpload");

/* ================= USER ROUTES ================= */

// Check agreement status
router.get("/status/:bookingId", agreementsFormController.getAgreementByBookingId);

// Submit form (NO signature file upload now)
router.post(
  "/submit",
  uploadAgreement.fields([
    { name: "aadhaar_front", maxCount: 1 },
    { name: "aadhaar_back", maxCount: 1 },
    { name: "pan_card", maxCount: 1 }
    // ❌ signature removed
  ]),
  async (req, res) => {
    try {
      const result = await agreementsFormController.submitAgreementForm(req);

      res.status(200).json({
        success: true,
        message: "Submitted Successfully",
        data: result
      });

    } catch (error) {
      console.error("❌ Submit Error:", error.message);

      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);


/* ================= ADMIN ROUTES ================= */

// Get all agreements
router.get("/admin/all", agreementsFormController.getAllAgreements);

// Get single agreement
router.get("/admin/:id", agreementsFormController.getAgreementById);

// Update status
router.put("/admin/:id/status", agreementsFormController.updateAgreementStatus);

// Upload final PDF/image
router.put(
  "/admin/:id/upload-image",
  uploadAgreement.single("final_image"),
  agreementsFormController.uploadFinalImage
);


/* ❌ REMOVED */
// router.post("/tenant/sign", agreementsFormController.tenantFinalSign);

module.exports = router;