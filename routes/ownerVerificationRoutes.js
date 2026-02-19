const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const upload = require("../middlewares/uploadOwnerDocs");
const controller = require("../controllers/ownerVerificationController");

/*
 POST /api/owner/verification
 Owner uploads Aadhaar/PAN + Property + Signature
 (FIRST TIME ONLY, reusable)
*/
router.post(
  "/verification",
  auth,
  upload.fields([
    { name: "id_proof", maxCount: 1 },
    { name: "property_proof", maxCount: 1 },
    { name: "digital_signature", maxCount: 1 }
  ]),
  controller.uploadOwnerDocs
);





// GET verification status
router.get(
  "/verification/status",
  auth,
  controller.getVerificationStatus
);


module.exports = router;
