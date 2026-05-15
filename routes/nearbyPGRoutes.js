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






/*
=========================================
ACCEPT GOOGLE PROPERTY
=========================================
*/
/*
=========================================
ACCEPT GOOGLE PROPERTY
=========================================
*/
/*
=========================================
ACCEPT GOOGLE PROPERTY
=========================================
*/
/*
=========================================
ACCEPT GOOGLE PROPERTY
=========================================
*/
/*
=========================================
ACCEPT GOOGLE PROPERTY
=========================================
*/

router.post("/accept-google-property", async (req, res) => {

  try {

    const { property } = req.body;

    if (!property) {

      return res.status(400).json({

        success: false,
        message: "Property data required"

      });

    }

    /*
    =========================================
    CHECK PROPERTY EXISTS
    =========================================
    */

    const [existing] = await db.query(

      `
      SELECT id
      FROM pgs
      WHERE pg_name = ?
      AND address = ?
      LIMIT 1
      `,

      [
        property.pg_name || property.name,
        property.address || ""
      ]

    );

    if (existing.length > 0) {

      return res.json({

        success: true,
        message: "Property Already Stored"

      });

    }

    /*
    =========================================
    PHOTOS
    =========================================
    */

    let photos = [];

    if (property.image) {

      photos.push(property.image);

    }

    /*
    =========================================
    AUTO CREATE / FIND OWNER
    =========================================
    */

    let ownerId = null;

    if (property.phone) {

      const [existingUser] = await db.query(

        `
        SELECT id
        FROM users
        WHERE phone = ?
        LIMIT 1
        `,

        [property.phone]

      );

      /*
      =========================================
      EXISTING OWNER
      =========================================
      */

      if (existingUser.length > 0) {

        ownerId = existingUser[0].id;

      }

      /*
      =========================================
      CREATE OWNER
      =========================================
      */

      else {

        const [newUser] = await db.query(

          `
          INSERT INTO users
          (

            name,
            phone,
            role,
            mobile_verified,
            owner_verification_status,
            pg_address,
            area,
            latitude,
            longitude

          )

          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,

          [

            property.pg_name || property.name,

            property.phone || "",

            "owner",

            1,

            "verified",

            property.address || "",

            property.address || "",

            property.latitude || null,

            property.longitude || null

          ]

        );

        ownerId = newUser.insertId;

      }

    }

    /*
    =========================================
    DETECT PG TYPE ENUM
    =========================================
    */

    let pgType = "boys";

    if (

      property.property_type
        ?.toLowerCase()
        .includes("girls")

    ) {

      pgType = "girls";

    }

    else if (

      property.property_type
        ?.toLowerCase()
        .includes("coliving")

    ) {

      pgType = "coliving";

    }

    /*
    =========================================
    DETECT CATEGORY ENUM
    =========================================
    */

    let pgCategory = "pg";

    if (

      property.property_type
        ?.toLowerCase()
        .includes("coliving")

    ) {

      pgCategory = "coliving";

    }

    if (

      property.property_type
        ?.toLowerCase()
        .includes("to let")

      ||

      property.property_type
        ?.toLowerCase()
        .includes("1 bhk")

      ||

      property.property_type
        ?.toLowerCase()
        .includes("2 bhk")

      ||

      property.property_type
        ?.toLowerCase()
        .includes("flat")

      ||

      property.property_type
        ?.toLowerCase()
        .includes("apartment")

    ) {

      pgCategory = "to_let";

    }

    /*
    =========================================
    INSERT PROPERTY
    =========================================
    */

    const [savedProperty] = await db.query(

      `
      INSERT INTO pgs
      (

        owner_id,
        pg_name,
        location,
        address,
        latitude,
        longitude,
        rating,
        contact_phone,
        pg_type,
        pg_category,
        nearby_place,
        city,
        area,
        status,
        description,
        photos

      )

      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,

      [

        ownerId,

        property.pg_name || property.name,

        property.address || "",

        property.address || "",

        property.latitude || null,

        property.longitude || null,

        property.rating || 0,

        property.phone || "",

        /*
        =========================================
        ENUM PG TYPE
        =========================================
        */

        pgType,

        /*
        =========================================
        ENUM CATEGORY
        =========================================
        */

        pgCategory,

        property.address || "",

        "Bengaluru",

        property.address || "",

        /*
        =========================================
        ENUM STATUS
        =========================================
        */

        "pending",

        "Imported from Google Maps",

        JSON.stringify(photos)

      ]

    );

    /*
    =========================================
    SUCCESS
    =========================================
    */

    res.json({

      success: true,

      property_id:
        savedProperty.insertId,

      owner_id:
        ownerId,

      status:
        "pending",

      message:
        "Property Added To Pending Approval"

    });

  } catch (error) {

    console.log(
      "Accept Property Error:",
      error
    );

    res.status(500).json({

      success: false,
      message: "Internal Server Error"

    });

  }

});



module.exports = router;