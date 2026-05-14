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
    1. GET WEBSITE PGS (SQL)
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

    const [websitePGs] = await db.query(query, [
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(lat),
      parseFloat(radius)
    ]);

    const formattedWebsitePGs = websitePGs.map((pg) => ({
      id: pg.id,
      pg_name: pg.pg_name || pg.name,
      name: pg.pg_name || pg.name,
      address: pg.address || pg.location || "",
      latitude: Number(pg.latitude),
      longitude: Number(pg.longitude),
      price: pg.price || pg.rent_amount || 0,
      rating: pg.rating || 0,
      distance: pg.distance,
      phone: pg.phone || "",
      source: "website",
      image: pg.image || pg.main_image || (pg.photos ? JSON.parse(pg.photos)[0] : null),
      maps_url: `https://www.google.com/maps/search/?api=1&query=${pg.latitude},${pg.longitude}`
    }));

    /*
    =========================================
    2. GOOGLE MAPS PGS (API)
    =========================================
    */
    let googlePGs = [];
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (apiKey) {
      try {
        // FIX: Google radius is in METERS. radius 5 -> 5000 meters.
        const radiusMeters = parseFloat(radius) * 1000;
        
        const googleURL = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&keyword=pg+hostel+paying+guest&type=lodging&key=${apiKey}`;

        const googleResponse = await axios.get(googleURL);
        
        // CRITICAL LOGGING: This helps you see why it's denied
        console.log("Google API Response Status:", googleResponse.data.status);
        if (googleResponse.data.error_message) {
            console.error("Google API Error Message:", googleResponse.data.error_message);
        }

        if (googleResponse.data.status === "OK" && googleResponse.data.results) {
          googlePGs = googleResponse.data.results.map((place) => ({
            id: `google_${place.place_id}`,
            pg_name: place.name,
            name: place.name,
            address: place.vicinity,
            latitude: place.geometry?.location?.lat,
            longitude: place.geometry?.location?.lng,
            rating: place.rating || 0,
            distance: null, 
            phone: "",
            source: "google",
            image: place.photos?.[0]
              ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`
              : "https://via.placeholder.com/400x250?text=Nearby+PG",
            maps_url: `https://www.google.com/maps/search/?api=1&query=google&query_place_id=${place.place_id}`
          }));
        }
      } catch (googleError) {
        console.error("Axios Google Request Failed:", googleError.message);
      }
    } else {
      console.warn("⚠️ GOOGLE_MAPS_API_KEY is missing in Render/Env variables!");
    }

    /*
    =========================================
    3. MERGE & REMOVE DUPLICATES
    =========================================
    */
    const allResults = [...formattedWebsitePGs, ...googlePGs];
    const uniquePGs = [];
    const seenNames = new Set();

    allResults.forEach((pg) => {
      const cleanName = (pg.name || "").toLowerCase().trim();
      if (!seenNames.has(cleanName)) {
        seenNames.add(cleanName);
        uniquePGs.push(pg);
      }
    });

    /*
    =========================================
    4. RESPONSE
    =========================================
    */
    res.json({
      success: true,
      website_count: formattedWebsitePGs.length,
      google_count: googlePGs.length,
      total: uniquePGs.length,
      pgs: uniquePGs
    });

  } catch (err) {
    console.error("Nearby PG Global Error:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
});

module.exports = router;