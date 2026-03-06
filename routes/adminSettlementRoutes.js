const express = require("express");
const router = express.Router();

const controller = require("../controllers/adminSettlementController");
const verifyFirebaseToken = require("../middlewares/auth");

//////////////////////////////////////////////////////
// GET PENDING SETTLEMENTS
//////////////////////////////////////////////////////

router.get(
  "/payments/admin/pending-settlements",
  verifyFirebaseToken,
  controller.getPendingSettlements
);

//////////////////////////////////////////////////////
// MARK SETTLED
//////////////////////////////////////////////////////

router.put(
  "/payments/admin/mark-settled/:bookingId",
  verifyFirebaseToken,
  controller.markAsSettled
);

module.exports = router;