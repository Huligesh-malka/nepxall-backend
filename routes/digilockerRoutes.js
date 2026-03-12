const express = require("express");
const router = express.Router();
const digilockerController = require("../controllers/digilockerController");

router.get("/link", digilockerController.getDigilockerLink);
router.post("/fetch", digilockerController.fetchDigilockerData);

module.exports = router;