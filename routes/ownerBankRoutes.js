const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const controller = require("../controllers/ownerBankController");

/* ================= OWNER BANK ================= */

router.get("/bank", auth, controller.getOwnerBank);
router.post("/bank", auth, controller.saveOwnerBank);

module.exports = router;