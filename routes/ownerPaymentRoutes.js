const express = require("express");
const router = express.Router();

const controller = require("../controllers/ownerPaymentController");

router.get("/payments", controller.getOwnerPayments);

module.exports = router;