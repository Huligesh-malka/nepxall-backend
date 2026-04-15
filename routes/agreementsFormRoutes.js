const express = require("express");
const router = express.Router();

const agreementsFormController = require("../controllers/agreementsFormController");
const uploadAgreement = require("../middlewares/agreementUpload");

// ✅ IMPORT AUTH MIDDLEWARE
const authMiddleware = require("../middlewares/authMiddleware");

/* ================= USER / TENANT ROUTES ================= */

// 1. Get agreement status
router.get(
  "/status/:bookingId",
  agreementsFormController.getAgreementByBookingId
);

// 2. Verify tenant mobile before OTP
router.post(
  "/tenant/verify",
  agreementsFormController.verifyTenantForBooking
);

// 3. Submit agreement form
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
      res.status(200).json({
        success: true,
        message: "Form Submitted Successfully",
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// 4. Tenant Final Signing
router.post(
  "/tenant/sign",
  agreementsFormController.tenantFinalSign
);

// ✅ NEW: GET USER AGREEMENTS (FINAL SIGNED ONLY)
router.get(
  "/user/agreements",
  authMiddleware,
  agreementsFormController.getUserAgreements
);

/* ================= ADMIN ROUTES ================= */

// Get all agreements
router.get(
  "/admin/all",
  agreementsFormController.getAllAgreements
);

// Get single agreement
router.get(
  "/admin/:id",
  agreementsFormController.getAgreementById
);

// Update status
router.put(
  "/admin/:id/status",
  agreementsFormController.updateAgreementStatus
);

// Upload final image
router.put(
  "/admin/:id/upload-image",
  uploadAgreement.single("final_image"),
  agreementsFormController.uploadFinalImage
);

// Delete agreement
router.delete(
  "/admin/:id",
  agreementsFormController.deleteAgreement
);

module.exports = router;