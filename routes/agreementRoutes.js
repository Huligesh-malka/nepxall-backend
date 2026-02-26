const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");

const {
  getAgreement,
  ownerESign,
  tenantESign,
  downloadAgreement,
  verifyAgreement,
  getAgreementStatus,
  getPublicAgreement
} = require("../controllers/agreementController");

router.get("/booking/:bookingId", auth, getAgreement);
router.get("/status/:bookingId", auth, getAgreementStatus);

router.post("/owner-esign", auth, ownerESign);
router.post("/tenant-esign", auth, tenantESign);

router.get("/download/:bookingId", auth, downloadAgreement);

// 🌐 PUBLIC
router.get("/verify/:hash", verifyAgreement);
router.get("/public/:hash", getPublicAgreement);

module.exports = router;