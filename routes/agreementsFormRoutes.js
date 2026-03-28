const express = require("express");
const router = express.Router();
const multer = require("multer");
const agreementsFormController = require("../controllers/agreementsFormController");
const uploadAgreement = require("../middlewares/agreementUpload");

// ================= USER SUBMIT (UNCHANGED) =================
router.post("/submit", (req, res, next) => {
    uploadAgreement.fields([
      { name: "aadhaar_front", maxCount: 1 },
      { name: "aadhaar_back", maxCount: 1 },
      { name: "pan_card", maxCount: 1 },
      { name: "signature", maxCount: 1 }
    ])(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      const result = await agreementsFormController.submitAgreementForm(req);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ================= ADMIN ROUTES (ADDED) =================

// ✅ Get all agreements
router.get("/admin/all", agreementsFormController.getAllAgreements);

// ✅ Get single agreement
router.get("/admin/:id", agreementsFormController.getAgreementById);

// ✅ Update agreement status
router.put("/admin/:id/status", agreementsFormController.updateAgreementStatus);

module.exports = router;