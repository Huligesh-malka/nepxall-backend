const express = require("express");
const router = express.Router();

const {
  requestVacate,
  addDamage,
  getDamages,
  acceptDamage,
  rejectDamage,
  getSettlement,
  closeAgreement,
} = require("../controllers/vacateController");

// Vacate flow
router.post("/request", requestVacate);

// Damage flow
router.post("/damage", addDamage);                 // owner adds
router.get("/damages/:agreementId", getDamages);   // tenant views
router.post("/damage/accept", acceptDamage);       // tenant accepts
router.post("/damage/reject", rejectDamage);       // tenant rejects

// Settlement & close
router.get("/settlement/:agreementId", getSettlement);
router.post("/close", closeAgreement);

module.exports = router;
