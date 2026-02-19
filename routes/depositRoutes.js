const express = require("express");
const router = express.Router();

const {
  addDeposit,
  getDepositsByAgreement,
} = require("../controllers/depositController");

router.post("/add", addDeposit);
router.get("/:agreementId", getDepositsByAgreement);

module.exports = router;
