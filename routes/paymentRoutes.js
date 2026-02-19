const express = require("express");
const router = express.Router();
const controller = require("../controllers/paymentController");

router.post("/pay", controller.makePayment);
router.get("/user/:userId", controller.getUserPayments);

module.exports = router;
