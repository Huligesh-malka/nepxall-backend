const express = require("express");
const router = express.Router();
const agreementsFormController = require("../controllers/agreementsFormController");
const uploadAgreement = require("../middlewares/agreementUpload");

/* ================= USER SUBMIT ================= */
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
        console.error("❌ Upload error:", err.message);
        return res.status(400).json({
          success: false,
          message: err.message
        });
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
      console.error("❌ Submit error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Failed to submit agreement",
        error: error.message
      });
    }
  }
);

/* ================= ADMIN ROUTES ================= */

// ✅ Get all agreements
router.get("/admin/all", async (req, res) => {
  try {
    await agreementsFormController.getAllAgreements(req, res);
  } catch (error) {
    console.error("❌ Get all error:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Get single agreement
router.get("/admin/:id", async (req, res) => {
  try {
    await agreementsFormController.getAgreementById(req, res);
  } catch (error) {
    console.error("❌ Get by id error:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Update agreement status
router.put("/admin/:id/status", async (req, res) => {
  try {
    await agreementsFormController.updateAgreementStatus(req, res);
  } catch (error) {
    console.error("❌ Update status error:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ================= EXPORT ================= */
module.exports = router;