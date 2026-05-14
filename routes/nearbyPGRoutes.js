const express = require("express");
const router = express.Router();

const db = require("../db");

router.get("/nearby", async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.query;

    const query = `
      SELECT *,
      (
        6371 * acos(
          cos(radians(?)) *
          cos(radians(latitude)) *
          cos(radians(longitude) - radians(?)) +
          sin(radians(?)) *
          sin(radians(latitude))
        )
      ) AS distance
      FROM pgs
      HAVING distance < ?
      ORDER BY distance ASC
    `;

    const [pgs] = await db.query(query, [
      lat,
      lng,
      lat,
      radius,
    ]);

    res.json({
      success: true,
      count: pgs.length,
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