const express = require("express");
const axios = require("axios");

const router = express.Router();

const db = require("../db");

/*
--------------------------------------------------
GET NEARBY PGS
--------------------------------------------------
*/
router.get("/nearby", async (req, res) => {

  try {

    const {
      lat,
      lng,
      radius = 5
    } = req.query;

    /*
    --------------------------------------------------
    GET WEBSITE PGS FROM MYSQL
    --------------------------------------------------
    */
    const query = `
      SELECT *,
      (
        6371 * acos(
          cos(radians(?))
          * cos(radians(latitude))
          * cos(radians(longitude) - radians(?))
          + sin(radians(?))
          * sin(radians(latitude))
        )
      ) AS distance
      FROM pgs
      HAVING distance < ?
      ORDER BY distance ASC
    `;

    const [websitePGs] = await db.query(
      query,
      [
        lat,
        lng,
        lat,
        radius
      ]
    );

    /*
    --------------------------------------------------
    GOOGLE MAPS API
    --------------------------------------------------
    */

    const GOOGLE_API_KEY =
      process.env.GOOGLE_MAPS_API_KEY;

    let googlePGs = [];

    try {

      const googleURL =
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=3000&keyword=pg&type=lodging&key=${GOOGLE_API_KEY}`;

      const googleRes =
        await axios.get(googleURL);

      googlePGs =
        (googleRes.data.results || []).map(
          (place) => ({

            id:
              `google_${place.place_id}`,

            name:
              place.name,

            address:
              place.vicinity,

            rating:
              place.rating || null,

            latitude:
              place.geometry.location.lat,

            longitude:
              place.geometry.location.lng,

            source:
              "google",

            image:
              place.photos?.[0]
                ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${GOOGLE_API_KEY}`
                : null,

            maps_url:
              `https://www.google.com/maps/place/?q=place_id:${place.place_id}`

          }))
    } catch (googleError) {

      console.log(
        "Google API Error:",
        googleError.message
      );

    }

    /*
    --------------------------------------------------
    FORMAT WEBSITE PGS
    --------------------------------------------------
    */

    const formattedWebsitePGs =
      websitePGs.map((pg) => ({

        ...pg,

        source:
          "website",

        image:
          pg.image ||
          pg.main_image ||
          null,

      }));

    /*
    --------------------------------------------------
    MERGE BOTH
    --------------------------------------------------
    */

    const allPGs = [
      ...formattedWebsitePGs,
      ...googlePGs
    ];

    /*
    --------------------------------------------------
    RESPONSE
    --------------------------------------------------
    */

    res.json({

      success: true,

      count:
        allPGs.length,

      website_count:
        formattedWebsitePGs.length,

      google_count:
        googlePGs.length,

      pgs:
        allPGs

    });

  } catch (err) {

    console.log(
      "Nearby PG Error:",
      err
    );

    res.status(500).json({

      success: false,

      message:
        "Server Error"

    });

  }

});

module.exports = router;