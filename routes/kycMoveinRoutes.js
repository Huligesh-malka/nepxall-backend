const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");

const controller = require("../controllers/kycMoveinController");

router.post("/consent", auth, controller.saveUserConsent);
router.post("/complete-movein", auth, controller.completeMoveIn);
router.get("/status/:bookingId", auth, controller.getMoveInStatus);

module.exports = router;