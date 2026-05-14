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

    /*
    =========================================
    VALIDATION
    =========================================
    */

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
    FORMAT WEBSITE PGS
    =========================================
    */

    const formattedWebsitePGs =
      websitePGs.map((pg) => ({

        id:
          pg.id,

        pg_name:
          pg.pg_name || pg.name,

        name:
          pg.pg_name || pg.name,

        address:
          pg.address || pg.location || "",

        latitude:
          Number(pg.latitude),

        longitude:
          Number(pg.longitude),

        price:
          pg.price || pg.rent_amount || 0,

        rating:
          pg.rating || 0,

        distance:
          pg.distance,

        phone:
          pg.phone || "",

        source:
          "website",

        image:
          pg.image ||
          pg.main_image ||
          (
            pg.photos
              ? (
                  (() => {
                    try {
                      const parsed =
                        JSON.parse(pg.photos);

                      return parsed?.[0] || null;

                    } catch {
                      return null;
                    }
                  })()
                )
              : null
          ),

        maps_url:
          `https://www.google.com/maps/search/?api=1&query=${pg.latitude},${pg.longitude}`

      }));

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

        /*
        =========================================
        BETTER GOOGLE SEARCH
        =========================================
        */

        const googleURL =
          `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&keyword=pg+hostel+coliving&type=lodging&key=${apiKey}`;

        const googleResponse =
          await axios.get(googleURL);

        console.log(
          "Google Results:",
          googleResponse.data.results?.length
        );

        googlePGs =
          (googleResponse.data.results || [])
          .map((place) => ({

            id:
              `google_${place.place_id}`,

            pg_name:
              place.name,

            name:
              place.name,

            address:
              place.vicinity,

            latitude:
              place.geometry?.location?.lat,

            longitude:
              place.geometry?.location?.lng,

            rating:
              place.rating || 0,

            distance:
              null,

            phone:
              "",

            source:
              "google",

            image:
              place.photos?.[0]
                ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`
                : "https://via.placeholder.com/400x250?text=Nearby+PG",

            maps_url:
              `https://www.google.com/maps/place/?q=place_id:${place.place_id}`

          }))
          .filter(
            (pg) =>
              pg.latitude &&
              pg.longitude
          );

      }

    } catch (googleError) {

      console.log(
        "Google Maps Error:",
        googleError.message
      );

    }

    /*
    =========================================
    REMOVE DUPLICATES
    =========================================
    */

    const uniquePGs = [];

    const seenNames = new Set();

    [...formattedWebsitePGs, ...googlePGs]
      .forEach((pg) => {

        const name =
          (pg.name || "")
          .toLowerCase()
          .trim();

        if (!seenNames.has(name)) {

          seenNames.add(name);

          uniquePGs.push(pg);

        }

      });

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
        uniquePGs.length,

      pgs:
        uniquePGs

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