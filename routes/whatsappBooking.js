const express = require("express");
const axios = require("axios");

const router = express.Router();

const db = require("../config/db");

/*
==================================================
 TEST ROUTE
==================================================
*/

router.get("/send-booking-whatsapp", (req, res) => {

  res.json({
    success: true,
    message: "WhatsApp route working"
  });

});

/*
==================================================
 SEND BOOKING WHATSAPP
==================================================
*/

router.post("/send-booking-whatsapp", async (req, res) => {

  try {

    console.log("=================================");
    console.log("📩 WHATSAPP REQUEST");
    console.log(req.body);
    console.log("=================================");

    const {
      ownerId,
      userName,
      userPhone,
      propertyName,
      area,
      rent
    } = req.body;

    /*
    ==========================================
    VALIDATION
    ==========================================
    */

    if (!ownerId) {

      return res.status(400).json({
        success: false,
        message: "Owner ID missing"
      });

    }

    /*
    ==========================================
    GET OWNER FROM USERS TABLE
    ==========================================
    */

    const [owners] = await db.query(
      `
      SELECT id, name, phone
      FROM users
      WHERE id = ?
      `,
      [ownerId]
    );

    console.log("OWNER:", owners);

    if (!owners || owners.length === 0) {

      return res.status(404).json({
        success: false,
        message: "Owner not found"
      });

    }

    const owner = owners[0];

    let ownerPhone = owner.phone;

    if (!ownerPhone) {

      return res.status(400).json({
        success: false,
        message: "Owner phone missing"
      });

    }

    /*
    ==========================================
    CLEAN PHONE
    ==========================================
    */

    ownerPhone = ownerPhone.replace(/\D/g, "");

    if (
      ownerPhone.startsWith("91") &&
      ownerPhone.length > 10
    ) {
      ownerPhone = ownerPhone.substring(2);
    }

    console.log("📞 FINAL PHONE:", ownerPhone);

    /*
    ==========================================
    ENV VARIABLES
    ==========================================
    */

    const AUTH_KEY =
      process.env.MSG91_AUTH_KEY;

    const WHATSAPP_NUMBER =
      process.env.MSG91_WHATSAPP_NUMBER;

    console.log("AUTH EXISTS:", !!AUTH_KEY);
    console.log("WHATSAPP NUMBER:", WHATSAPP_NUMBER);

    if (!AUTH_KEY) {

      return res.status(500).json({
        success: false,
        message: "MSG91_AUTH_KEY missing"
      });

    }

    if (!WHATSAPP_NUMBER) {

      return res.status(500).json({
        success: false,
        message: "MSG91_WHATSAPP_NUMBER missing"
      });

    }

    /*
    ==========================================
    SEND WHATSAPP
    ==========================================
    */

    const response = await axios.post(

      "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/",

      {
        integrated_number: WHATSAPP_NUMBER,

        content_type: "text",

        recipient_number: `91${ownerPhone}`,

        text: `
🏠 New Booking Received - Nepxall

Hello ${owner.name || "Owner"},

👤 User Name: ${userName || "Customer"}

📞 User Phone: ${userPhone || "No Phone"}

🏢 Property: ${propertyName || "Property"}

📍 Area: ${area || "Area"}

💰 Rent: ₹${rent || "0"}

Please contact customer soon.

- Team Nepxall
        `
      },

      {
        headers: {
          accept: "application/json",
          authkey: AUTH_KEY,
          "content-type": "application/json"
        }
      }

    );

    console.log("=================================");
    console.log("✅ WHATSAPP SENT SUCCESSFULLY");
    console.log(response.data);
    console.log("=================================");

    return res.status(200).json({
      success: true,
      message: "WhatsApp sent successfully",
      data: response.data
    });

  } catch (error) {

    console.log("=================================");
    console.log("❌ WHATSAPP ERROR");
    console.log("=================================");

    console.log(
      error.response?.data ||
      error.message ||
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.response?.data ||
        error.message ||
        "Unknown error"
    });

  }

});

module.exports = router;