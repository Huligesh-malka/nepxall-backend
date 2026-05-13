const express = require("express");
const axios = require("axios");

const router = express.Router();

/*
==================================================
 WHATSAPP OWNER BOOKING NOTIFICATION
 MSG91 WHATSAPP API
==================================================
*/

router.post("/send-booking-whatsapp", async (req, res) => {
  try {
    let {
      ownerPhone,
      ownerName,
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

    if (!ownerPhone) {
      return res.status(400).json({
        success: false,
        message: "Owner phone number required"
      });
    }

    // Clean owner number
    ownerPhone = ownerPhone.replace(/\D/g, "");

    // Convert to 10 digit
    if (ownerPhone.startsWith("91") && ownerPhone.length > 10) {
      ownerPhone = ownerPhone.substring(2);
    }

    const AUTH_KEY = process.env.MSG91_AUTH_KEY;

    if (!AUTH_KEY) {
      return res.status(500).json({
        success: false,
        message: "MSG91 Auth Key missing"
      });
    }

    /*
    ==========================================
    WHATSAPP MESSAGE
    ==========================================
    */

    const messageText = `
🏠 New Booking Received - Nepxall

Hello ${ownerName || "Owner"},

A user has booked your property.

👤 User Name: ${userName || "Customer"}
📞 User Phone: ${userPhone || "Not Provided"}

🏢 Property: ${propertyName || "PG"}
📍 Area: ${area || "Location"}
💰 Rent: ₹${rent || "0"}

Please contact the customer soon.

- Team Nepxall
`;

    /*
    ==========================================
    MSG91 API REQUEST
    ==========================================
    */

    const response = await axios({
      method: "POST",
      url: "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/",
      headers: {
        accept: "application/json",
        authkey: AUTH_KEY,
        "content-type": "application/json"
      },
      data: {
        integrated_number: "917483090510", // Your MSG91 WhatsApp Number
        recipient_number: `91${ownerPhone}`, // Owner Number
        content_type: "text",
        text: messageText
      }
    });

    console.log("=================================");
    console.log("✅ WHATSAPP SENT SUCCESSFULLY");
    console.log(`📞 TO: 91${ownerPhone}`);
    console.log("=================================");

    return res.status(200).json({
      success: true,
      message: "WhatsApp notification sent successfully",
      data: response.data
    });

  } catch (error) {
    console.log("❌ WHATSAPP API ERROR");

    if (error.response) {
      console.log(error.response.data);

      return res.status(error.response.status).json({
        success: false,
        message: "MSG91 WhatsApp API Error",
        error: error.response.data
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;