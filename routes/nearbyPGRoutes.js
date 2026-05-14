const express = require("express");
const axios = require("axios");

const router = express.Router();
const db = require("../db");

/*
=========================================
GET NEARBY PGS
=========================================
*/

router.get("/nearby", async (req, res) => {

  try {

    const { lat, lng, radius = 5 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude required"
      });
    }

    /*
    =========================================
    GET WEBSITE PGS
    =========================================
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
      WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
      HAVING distance < ?
      ORDER BY distance ASC
      LIMIT 50
    `;

    const [websitePGs] = await db.query(
      query,
      [
        parseFloat(lat),
        parseFloat(lng),
        parseFloat(lat),
        parseFloat(radius)
      ]
    );

    /*
    =========================================
    GOOGLE MAPS PGS
    =========================================
    */

    let googlePGs = [];

    try {

      const apiKey =
        process.env.GOOGLE_MAPS_API_KEY;

      if (apiKey) {

        const googleURL =
          `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=3000&keyword=pg&type=lodging&key=${apiKey}`;

        const googleResponse =
          await axios.get(googleURL);

        googlePGs =
          (googleResponse.data.results || []).map((place) => ({

            id:
              `google_${place.place_id}`,

            name:
              place.name,

            address:
              place.vicinity,

            latitude:
              place.geometry?.location?.lat,

            longitude:
              place.geometry?.location?.lng,

            rating:
              place.rating || null,

            source:
              "google",

            image:
              place.photos?.[0]
                ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`
                : null,

            maps_url:
              `https://www.google.com/maps/place/?q=place_id:${place.place_id}`

          }));

      }

    } catch (googleError) {

      console.log(
        "Google Maps Error:",
        googleError.message
      );

    }

    /*
    =========================================
    FORMAT WEBSITE PGS
    =========================================
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

        maps_url:
          `https://www.google.com/maps/search/?api=1&query=${pg.latitude},${pg.longitude}`

      }));

    /*
    =========================================
    MERGE BOTH
    =========================================
    */

    const allPGs = [
      ...formattedWebsitePGs,
      ...googlePGs
    ];

    /*
    =========================================
    RESPONSE
    =========================================
    */

    res.json({

      success: true,

      website_count:
        formattedWebsitePGs.length,

      google_count:
        googlePGs.length,

      total:
        allPGs.length,

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