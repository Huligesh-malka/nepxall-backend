const express = require("express");
const router = express.Router();

const controller = require("../controllers/ownerPaymentController");
const auth = require("../middleware/authMiddleware");

router.get("/payments", auth, controller.getOwnerPayments);

module.exports = router;