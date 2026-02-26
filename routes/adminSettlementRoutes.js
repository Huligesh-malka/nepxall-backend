const router = require("express").Router();
const controller = require("../controllers/adminSettlementController");

router.get("/pending", controller.getPendingSettlements);
router.put("/mark-settled/:id", controller.markAsSettled);

module.exports = router;