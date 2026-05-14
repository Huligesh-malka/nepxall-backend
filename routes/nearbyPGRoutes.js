const express = require("express");
const router = express.Router();

const PG = require("../models/PG");

router.get("/nearby", async (req, res) => {
  try {
    const { lat, lng } = req.query;

    const pgs = await PG.find({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          $maxDistance: 5000,
        },
      },
    });

    res.json({
      success: true,
      pgs,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

module.exports = router;