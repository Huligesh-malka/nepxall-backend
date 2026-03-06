const express = require("express");
const router = express.Router();

const adminSettlementController = require("../controllers/adminSettlementController");
const verifyFirebaseToken = require("../middlewares/auth");

//////////////////////////////////////////////////////
// ADMIN - GET PENDING SETTLEMENTS
//////////////////////////////////////////////////////

router.get(
  "/admin/pending-settlements",
  verifyFirebaseToken,
  adminSettlementController.getPendingSettlements
);

//////////////////////////////////////////////////////
// ADMIN - MARK SETTLEMENT DONE
//////////////////////////////////////////////////////

router.put(
  "/admin/mark-settled/:bookingId",
  verifyFirebaseToken,
  adminSettlementController.markAsSettled
);

module.exports = router;