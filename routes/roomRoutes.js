const express = require("express");
const router = express.Router();
const roomController = require("../controllers/roomController");

/* ADD ROOM */
router.post("/add", roomController.addRoom);

/* GET ROOMS */
router.get("/:pgId", roomController.getRoomsByPG);

module.exports = router;
