const express = require("express");
const router = express.Router();

const controller = require("../controllers/adminSettlementController");

router.get("/pending-settlements", controller.getPendingSettlements);

router.put("/mark-settled/:bookingId", controller.markAsSettled);


router.get("/settlement-history", controller.getSettlementHistory);

module.exports = router;