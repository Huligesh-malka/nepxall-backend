const express = require("express");
const router = express.Router();
const agreementsFormController = require("../controllers/agreementsFormController");
const uploadAgreement = require("../middlewares/agreementUpload");

/* ================= HEALTH CHECK ================= */
router.get("/test", (req, res) => {
  res.json({ success: true, message: "Agreement Route is Active" });
});

/* ================= USER ROUTES ================= */
router.post(
  "/submit",
  (req, res, next) => {
    uploadAgreement.fields([
      { name: "aadhaar_front", maxCount: 1 },
      { name: "aadhaar_back", maxCount: 1 },
      { name: "pan_card", maxCount: 1 },
      { name: "signature", maxCount: 1 }
    ])(req, res, (err) => {
      if (err) {
        console.error("❌ Upload Middleware Error:", err.message);
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const result = await agreementsFormController.submitAgreementForm(req);
      return res.status(200).json({
        success: true,
        message: "Agreement submitted successfully",
        data: result
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to submit agreement",
        error: error.message
      });
    }
  }
);

/* ================= ADMIN ROUTES ================= */

// Fetch all agreements
router.get("/admin/all", agreementsFormController.getAllAgreements);

// Fetch single agreement
router.get("/admin/:id", agreementsFormController.getAgreementById);

// Update status (Approve/Reject)
router.put("/admin/:id/status", agreementsFormController.updateAgreementStatus);

// Upload final PDF
router.put(
  "/admin/:id/upload-pdf",
  uploadAgreement.single("final_pdf"),
  agreementsFormController.uploadFinalPDF
);

module.exports = router;