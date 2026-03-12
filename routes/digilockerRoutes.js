const express = require("express");
const router = express.Router();

const {
  getDigilockerLink,
  fetchDigilockerData
} = require("../controllers/digilockerController");

router.get("/link", getDigilockerLink);
router.post("/fetch", fetchDigilockerData);

module.exports = router;