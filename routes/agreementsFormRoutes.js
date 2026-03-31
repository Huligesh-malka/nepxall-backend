const express = require("express");
const router = express.Router();
const agreementsFormController = require("../controllers/agreementsFormController");
const uploadAgreement = require("../middlewares/agreementUpload");

/* ================= USER/TENANT ROUTES ================= */
router.get("/status/:bookingId", agreementsFormController.getAgreementByBookingId);

// Verify mobile belongs to the tenant before OTP
router.post("/tenant/verify", agreementsFormController.verifyTenantForBooking);

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
      const result = await agreementsFormController.submitAgreementForm(req);
      res.status(200).json({ success: true, message: "Submitted Successfully", data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

/* ================= ADMIN & SIGNING ROUTES ================= */
router.get("/admin/all", agreementsFormController.getAllAgreements);
router.get("/admin/:id", agreementsFormController.getAgreementById);
router.put("/admin/:id/status", agreementsFormController.updateAgreementStatus);
router.put("/admin/:id/upload-image", uploadAgreement.single("final_image"), agreementsFormController.uploadFinalImage);
router.delete("/admin/:id", agreementsFormController.deleteAgreement);

/* ================= SIGNING FLOW ================= */
router.post("/tenant/sign", agreementsFormController.tenantFinalSign);

module.exports = router;