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
GET FULL PLACE DETAILS
=========================================
*/

const getGooglePlaceDetails = async (
  placeId,
  apiKey
) => {

  try {

    const detailsURL =
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,photos,formatted_phone_number,website,rating,reviews&key=${apiKey}`;

    const response =
      await axios.get(detailsURL);

    return response.data?.result || {};

  } catch (error) {

    console.log(
      "Place Details Error:",
      error.message
    );

    return {};

  }

};



/*
=========================================
GOOGLE SEARCH PROPERTIES
=========================================
*/

router.get("/google-search", async (req, res) => {

  try {

    const { query } = req.query;

    /*
    =========================================
    VALIDATION
    =========================================
    */

    if (!query) {

      return res.status(400).json({

        success: false,
        message: "Search query required"

      });

    }

    /*
    =========================================
    GOOGLE MAPS API
    =========================================
    */

    const apiKey =
      process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {

      return res.status(500).json({

        success: false,
        message: "Google API Key Missing"

      });

    }

    /*
    =========================================
    GOOGLE TEXT SEARCH
    =========================================
    */

    const googleURL =
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;

    const googleResponse =
      await axios.get(googleURL);

    console.log(
      "Google Search Status:",
      googleResponse.data.status
    );

    /*
    =========================================
    RESULTS
    =========================================
    */

    const places =
      googleResponse.data.results || [];

    /*
    =========================================
    FORMAT RESULTS
    =========================================
    */

    const properties =
      await Promise.all(

        places.map(async (place) => {

          /*
          =========================================
          PLACE DETAILS
          =========================================
          */

          const details =
            await getGooglePlaceDetails(
              place.place_id,
              apiKey
            );

          /*
          =========================================
          PHONE
          =========================================
          */

          const phone =
            details.formatted_phone_number || "";

          /*
          =========================================
          ALL PHOTOS
          =========================================
          */

          let allPhotos = [];

          if (
            details.photos &&
            Array.isArray(details.photos)
          ) {

            allPhotos =
              details.photos.map((photo) => {

                return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photo_reference=${photo.photo_reference}&key=${apiKey}`;

              });

          }

          /*
          =========================================
          RETURN PROPERTY
          =========================================
          */

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
              place.formatted_address,

            latitude:
              place.geometry?.location?.lat,

            longitude:
              place.geometry?.location?.lng,

            rating:
              place.rating || 0,

            phone:
              phone,

            source:
              "google",

            property_type:
              query,

            /*
            =========================================
            MAIN IMAGE
            =========================================
            */

            image:
              allPhotos.length > 0
                ? allPhotos[0]
                : "https://via.placeholder.com/400x250?text=Property",

            /*
            =========================================
            ALL PHOTOS
            =========================================
            */

            photos:
              allPhotos,

            maps_url:
              `https://www.google.com/maps/search/?api=1&query_place_id=${place.place_id}`

          };

        })

      );

    /*
    =========================================
    REMOVE DUPLICATES
    =========================================
    */

    const uniqueProperties = [];

    const seen = new Set();

    properties.forEach((property) => {

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

      total:
        uniqueProperties.length,

      pgs:
        uniqueProperties

    });

  } catch (error) {

    console.log(
      "Google Search Error:",
      error
    );

    res.status(500).json({

      success: false,
      message: "Internal Server Error"

    });

  }

});  




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
        property_id: existing[0].id,
        message: "Property Already Stored"

      });

    }

    /*
    =========================================
    SAVE ALL PHOTOS
    =========================================
    */

    let photos = [];

    if (
      property.photos &&
      Array.isArray(property.photos)
    ) {

      photos = property.photos;

    }

    else if (property.image) {

      photos.push(property.image);

    }

    /*
    =========================================
    FORMAT PHONE NUMBER
    =========================================
    */

    let formattedPhone = "";

    if (property.phone) {

      /*
      REMOVE SPACES
      */

      formattedPhone =
        property.phone.replace(/\D/g, "");

      /*
      REMOVE FIRST ZERO
      */

      if (formattedPhone.startsWith("0")) {

        formattedPhone =
          formattedPhone.substring(1);

      }

    }

    /*
    =========================================
    AUTO CREATE / FIND OWNER
    =========================================
    */

    let ownerId = null;

    if (formattedPhone) {

      /*
      =========================================
      CHECK EXISTING USER
      =========================================
      */

      const [existingUser] = await db.query(

        `
        SELECT id
        FROM users
        WHERE phone = ?
        LIMIT 1
        `,

        [formattedPhone]

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

            formattedPhone,

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
    GENERATE PG CODE
    =========================================
    */

    const pgCode =
      `PG${Date.now()}`;

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
        pg_code,
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

      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,

      [

        ownerId,

        /*
        =========================================
        AUTO GENERATED PG CODE
        =========================================
        */

        pgCode,

        property.pg_name || property.name,

        property.address || "",

        property.address || "",

        property.latitude || null,

        property.longitude || null,

        property.rating || 0,

        /*
        =========================================
        CLEAN PHONE
        =========================================
        */

        formattedPhone,

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

      pg_code:
        pgCode,

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






/*
=========================================
ACCEPT FACEBOOK PROPERTY - UPDATED WITH FULL FIELDS
=========================================
*/
/*
=========================================
ACCEPT FACEBOOK PROPERTY - UPDATED WITH FULL FIELDS
=========================================
*/
/*
=========================================
ACCEPT FACEBOOK PROPERTY - FIXED WITH FULL STRUCTURE
=========================================
*/

router.post(
  "/accept-facebook-property",
  async (req, res) => {

    try {

      const { property } = req.body;

      if (!property) {

        return res.status(400).json({

          success: false,
          message: "Property required"

        });

      }

      /*
      =========================================
      CHECK EXISTS
      =========================================
      */

      const [existing] = await db.query(

        `
        SELECT id
        FROM pgs
        WHERE facebook_url = ?
        LIMIT 1
        `,

        [property.facebook_url]

      );

      // Return property_id even when already exists
      if (existing.length > 0) {

        return res.json({

          success: true,
          property_id: existing[0].id,
          message: "Already Imported"

        });

      }

      /*
      =========================================
      PHOTOS - Use defaults if empty
      =========================================
      */

      let photos = [];

      if (
        property.photos &&
        Array.isArray(property.photos) &&
        property.photos.length > 0
      ) {

        photos = property.photos;

      } else {

        // Default photos if none provided
        photos = [
          "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800",
          "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800",
          "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800"
        ];

      }

      /*
      =========================================
      SAVE PROPERTY - MATCHING GOOGLE STRUCTURE
      =========================================
      */

      const [saved] = await db.query(

        `
        INSERT INTO pgs
        (

          owner_id,
          pg_code,
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
          photos,
          facebook_url

        )

        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,

        [

          1, // Default owner_id (admin)

          `FB${Date.now()}`,

          property.pg_name || "Facebook Imported Property",

          property.address || "Bengaluru, Karnataka",

          property.address || "Bengaluru, Karnataka",

          null, // latitude (will be updated later)

          null, // longitude (will be updated later)

          0, // default rating

          property.contact_phone || "",

          property.pg_type || "boys",

          property.pg_category || "to_let",

          property.nearby_place || "Facebook",

          property.city || "Bengaluru",

          property.area || "Whitefield",

          "pending",

          property.description || "Imported From Facebook",

          JSON.stringify(photos),

          property.facebook_url

        ]

      );

      /*
      =========================================
      RESPONSE
      =========================================
      */

      res.json({

        success: true,
        property_id: saved.insertId,
        message: "Facebook Property Imported"

      });

    } catch (error) {

      console.log(
        "Facebook Import Error:",
        error
      );

      res.status(500).json({

        success: false,
        message: "Internal Server Error"

      });

    }

  }
);

module.exports = router;