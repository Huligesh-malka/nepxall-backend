const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");

const {
  getAgreement,
  ownerESign,
  tenantESign,
  downloadAgreement,
  verifyAgreement,
  getAgreementStatus,
  getPublicAgreement
} = require("../controllers/agreementController");

//////////////////////////////////////////////////////
// 🔓 PUBLIC VIEW (No Login Required)
//////////////////////////////////////////////////////

// View agreement by booking (for preview page)
router.get("/booking/:bookingId", getAgreement);

// Agreement status
router.get("/status/:bookingId", getAgreementStatus);

// Public verification by hash
router.get("/verify/:hash", verifyAgreement);

// Public read-only agreement via QR
router.get("/public/:hash", getPublicAgreement);

//////////////////////////////////////////////////////
// 🔒 PROTECTED ACTIONS (Login Required)
//////////////////////////////////////////////////////

router.post("/owner-esign", auth, ownerESign);
router.post("/tenant-esign", auth, tenantESign);

router.get("/download/:bookingId", auth, downloadAgreement);

module.exports = router;