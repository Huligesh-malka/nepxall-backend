const express = require("express");
const router = express.Router();
const agreementsFormController = require("../controllers/agreementsFormController");
const uploadAgreement = require("../middlewares/agreementUpload");

/**
 * @route   GET /api/agreements/test
 * @desc    Check if the route is registered and reachable
 */
router.get("/test", (req, res) => {
  res.json({ success: true, message: "Agreement Route is Active" });
});

/* ================= USER SUBMIT ================= */
// Route: POST /api/agreements/submit
router.post(
  "/submit",
  (req, res, next) => {
    // Handling multiple file uploads via Multer middleware
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

/**
 * @route   GET /api/agreements/admin/all
 * @desc    Fetch all agreement records for the admin dashboard
 */
router.get("/admin/all", agreementsFormController.getAllAgreements);

/**
 * @route   GET /api/agreements/admin/:id
 * @desc    Fetch specific agreement details
 */
router.get("/admin/:id", agreementsFormController.getAgreementById);

/**
 * @route   PUT /api/agreements/admin/:id/status
 * @desc    Approve or Reject an agreement
 */
router.put("/admin/:id/status", agreementsFormController.updateAgreementStatus);





// Add this route to your Admin section
router.put(
  "/admin/:id/upload-pdf",
  uploadAgreement.single("final_pdf"), // Uses multer to catch the file
  agreementsFormController.uploadFinalPDF
);

/* ================= EXPORT ================= */
module.exports = router;