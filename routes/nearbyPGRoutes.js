const express = require("express");
const axios = require("axios");

const router = express.Router();

const db = require("../db");

console.log("✅ Nearby PG Route Loaded");

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
    VALIDATION
    --------------------------------------------------
    */

    if (!lat || !lng) {

      return res.status(400).json({

        success: false,

        message:
          "Latitude and longitude required"

      });

    }

    /*
    --------------------------------------------------
    GET WEBSITE PGS
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

      WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL

      HAVING distance < ?

      ORDER BY distance ASC
    `;

    const [websitePGs] =
      await db.query(
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
    FORMAT WEBSITE PGS
    --------------------------------------------------
    */

    const formattedWebsitePGs =
      websitePGs.map((pg) => {

        let image = null;

        /*
        ----------------------------------------------
        HANDLE PHOTOS JSON
        ----------------------------------------------
        */

        try {

          if (pg.photos) {

            const parsedPhotos =
              JSON.parse(pg.photos);

            if (
              Array.isArray(parsedPhotos)
              && parsedPhotos.length > 0
            ) {

              image =
                parsedPhotos[0];

            }

          }

        } catch (e) {

          image =
            pg.main_image ||
            pg.image ||
            null;

        }

        return {

          id:
            pg.id,

          name:
            pg.pg_name || "Unnamed PG",

          address:
            pg.address ||
            pg.location ||
            "",

          latitude:
            Number(pg.latitude),

          longitude:
            Number(pg.longitude),

          distance:
            pg.distance,

          rating:
            pg.rating || null,

          price:
            pg.rent_amount ||
            pg.price ||
            null,

          phone:
            pg.phone ||
            pg.contact_phone ||
            "",

          image,

          source:
            "website"

        };

      });

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
        (googleRes.data.results || [])
          .map((place) => ({

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

          }));

    } catch (googleError) {

      console.log(
        "Google API Error:",
        googleError.message
      );

    }

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

    return res.json({

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

    return res.status(500).json({

      success: false,

      message:
        "Server Error"

    });

  }

});

module.exports = router;