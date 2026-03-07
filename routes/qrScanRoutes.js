const express = require("express");
const router = express.Router();
const pgController = require("../controllers/pgController");

router.get("/scan/:id", pgController.getPGScanData);

module.exports = router;