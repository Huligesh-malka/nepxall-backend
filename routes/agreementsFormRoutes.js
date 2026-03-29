const express = require("express");
const router = express.Router();
const controller = require("../controllers/agreementsFormController");
const upload = require("../middlewares/agreementUpload");

/* USER */
router.get("/status/:bookingId", controller.getAgreementByBookingId);

router.post("/submit",
  upload.fields([
    { name: "aadhaar_front", maxCount: 1 },
    { name: "aadhaar_back", maxCount: 1 },
    { name: "pan_card", maxCount: 1 },
    { name: "signature", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const result = await controller.submitAgreementForm(req);
      res.json({ success: true, data: result });
    } catch {
      res.status(500).json({ success: false });
    }
  }
);

/* ADMIN */
router.put("/admin/:id/upload-image", upload.single("final_image"), controller.uploadFinalImage);

/* OWNER SIGN */
router.post("/owner/sign", controller.ownerSign);

/* TENANT SIGN */
router.post("/tenant/sign", controller.tenantFinalSign);

module.exports = router;