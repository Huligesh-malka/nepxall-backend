const express = require("express");
const router = express.Router();
const agreementsFormController = require("../controllers/agreementsFormController");
const uploadAgreement = require("../middlewares/agreementUpload");

/* ================= USER ROUTES ================= */
router.post("/submit", 
  uploadAgreement.fields([{ name: "signature", maxCount: 1 }]), 
  async (req, res) => {
    try {
      const result = await agreementsFormController.submitAgreementForm(req);
      res.status(200).json({ success: true, message: "Submitted", data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
});

/* ================= ADMIN ROUTES ================= */
router.get("/admin/all", agreementsFormController.getAllAgreements);
router.get("/admin/:id", agreementsFormController.getAgreementById);

/**
 * ADMIN APPROVE:
 * Expects 'status' in body and 'estamp_paper' as a single file upload
 */
router.put("/admin/:id/status", 
  uploadAgreement.single("estamp_paper"), 
  agreementsFormController.updateAgreementStatus
);

/* ================= OWNER ROUTES ================= */
/**
 * OWNER SIGN:
 * Expects 'owner_signature' as a single file upload
 */
router.put("/owner/sign/:id", 
  uploadAgreement.single("owner_signature"), 
  agreementsFormController.ownerSignAgreement
);

module.exports = router;