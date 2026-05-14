const express = require("express");
const axios = require("axios");

const router = express.Router();
const db = require("../db");

/*
=========================================
GET PLACE PHONE NUMBER
=========================================
*/

const getGooglePlacePhone = async (placeId, apiKey) => {

  try {

    const detailsURL =
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_phone_number&key=${apiKey}`;

    const response =
      await axios.get(detailsURL);

    return (
      response.data?.result?.formatted_phone_number || ""
    );

  } catch (error) {

    console.log(
      "Phone Fetch Error:",
      error.message
    );

    return "";

  }

};

/*
=========================================
GET NEARBY PROPERTIES
=========================================
*/

router.get("/nearby", async (req, res) => {

  try {

    const {
      lat,
      lng,
      radius = 5
    } = req.query;

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
    SQL WEBSITE PGS
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
      LIMIT 100
    `;

    const [websitePGs] =
      await db.query(query, [

        parseFloat(lat),
        parseFloat(lng),
        parseFloat(lat),
        parseFloat(radius)

      ]);

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
          pg.address ||
          pg.location ||
          "",

        latitude:
          Number(pg.latitude),

        longitude:
          Number(pg.longitude),

        price:
          pg.price ||
          pg.rent_amount ||
          0,

        rating:
          pg.rating || 0,

        distance:
          Number(pg.distance).toFixed(1),

        phone:
          pg.phone || "",

        source:
          "website",

        property_type:
          pg.property_type ||
          "PG",

        image:
          pg.image ||
          pg.main_image ||
          (
            pg.photos
              ? JSON.parse(pg.photos)[0]
              : "https://via.placeholder.com/400x250?text=Nepxall+Property"
          ),

        maps_url:
          `https://www.google.com/maps/search/?api=1&query=${pg.latitude},${pg.longitude}`

      }));

    /*
    =========================================
    GOOGLE MAPS API
    =========================================
    */

    let googleProperties = [];

    const apiKey =
      process.env.GOOGLE_MAPS_API_KEY;

    if (apiKey) {

      try {

        const radiusMeters =
          parseFloat(radius) * 1000;

        /*
        =========================================
        SEARCH KEYWORDS
        =========================================
        */

        const keywords = [

          "pg",
          "coliving",
          "hostel",
          "boys pg",
          "girls pg",
          "paying guest",
          "rental house",
          "to let",
          "1 bhk",
          "2 bhk",
          "apartment",
          "flat rent",
          "room rent"

        ];

        for (const keyword of keywords) {

          try {

            const googleURL =
              `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&keyword=${encodeURIComponent(keyword)}&key=${apiKey}`;

            const googleResponse =
              await axios.get(googleURL);

            console.log(
              `Google Search: ${keyword}`,
              googleResponse.data.status
            );

            if (

              googleResponse.data.status === "OK"

              &&

              googleResponse.data.results

            ) {

              /*
              =========================================
              GET PHONE NUMBERS
              =========================================
              */

              const results =
                await Promise.all(

                  googleResponse.data.results.map(async (place) => {

                    /*
                    =========================================
                    FETCH PHONE NUMBER
                    =========================================
                    */

                    const phone =
                      await getGooglePlacePhone(
                        place.place_id,
                        apiKey
                      );

                    return {

                      id:
                        `google_${place.place_id}`,

                      place_id:
                        place.place_id,

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
                        phone,

                      source:
                        "google",

                      property_type:
                        keyword,

                      image:
                        place.photos?.[0]

                          ?

                          `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`

                          :

                          "https://via.placeholder.com/400x250?text=Nearby+Property",

                      maps_url:
                        `https://www.google.com/maps/search/?api=1&query=google&query_place_id=${place.place_id}`

                    };

                  })

                );

              googleProperties.push(...results);

            }

          } catch (keywordError) {

            console.log(
              "Keyword Search Error:",
              keyword,
              keywordError.message
            );

          }

        }

      } catch (googleError) {

        console.log(
          "Google Maps Error:",
          googleError.message
        );

      }

    } else {

      console.log(
        "GOOGLE_MAPS_API_KEY missing"
      );

    }

    /*
    =========================================
    MERGE ALL RESULTS
    =========================================
    */

    const allResults = [

      ...formattedWebsitePGs,
      ...googleProperties

    ];

    /*
    =========================================
    REMOVE DUPLICATES
    =========================================
    */

    const uniqueProperties = [];

    const seen = new Set();

    allResults.forEach((property) => {

      const uniqueKey =

        `${property.name}_${property.address}`
          .toLowerCase()
          .trim();

      if (!seen.has(uniqueKey)) {

        seen.add(uniqueKey);

        uniqueProperties.push(property);

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
        googleProperties.length,

      total:
        uniqueProperties.length,

      pgs:
        uniqueProperties

    });

  } catch (err) {

    console.log(
      "Nearby Property Error:",
      err
    );

    res.status(500).json({

      success: false,

      message:
        "Internal Server Error"

    });

  }

});

module.exports = router;