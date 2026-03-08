const express = require("express");
const router = express.Router();

const roomController = require("../controllers/roomController");

/* GET ROOMS */
router.get("/:pgId", roomController.getRoomsByPG);

/* ADD ROOM */
router.post("/add", roomController.addRoom);

module.exports = router;