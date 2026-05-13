const express = require("express");
const axios = require("axios");

const router = express.Router();

/*
==================================================
 NEPXALL WHATSAPP BOOKING NOTIFICATION
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
        message: "Owner phone required"
      });
    }

    /*
    ==========================================
    CLEAN PHONE NUMBER
    ==========================================
    */

    ownerPhone = ownerPhone.replace(/\D/g, "");

    // Remove 91 if exists
    if (ownerPhone.startsWith("91") && ownerPhone.length > 10) {
      ownerPhone = ownerPhone.substring(2);
    }

    const AUTH_KEY = process.env.MSG91_AUTH_KEY;
    const WHATSAPP_NUMBER = process.env.MSG91_WHATSAPP_NUMBER;

    if (!AUTH_KEY) {
      return res.status(500).json({
        success: false,
        message: "MSG91 Auth key missing"
      });
    }

    /*
    ==========================================
    WHATSAPP TEMPLATE API
    ==========================================
    */

    const response = await axios.post(
      "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
      {
        integrated_number: WHATSAPP_NUMBER,

        content_type: "template",

        payload: {
          messaging_product: "whatsapp",

          type: "template",

          template: {
            name: "booking_notification", // YOUR TEMPLATE NAME

            language: {
              code: "en",
              policy: "deterministic"
            },

            to_and_components: [
              {
                to: [`91${ownerPhone}`],

                components: {
                  body_1: {
                    type: "text",
                    value: ownerName || "Owner"
                  },

                  body_2: {
                    type: "text",
                    value: userName || "Customer"
                  },

                  body_3: {
                    type: "text",
                    value: userPhone || "No Phone"
                  },

                  body_4: {
                    type: "text",
                    value: propertyName || "Property"
                  },

                  body_5: {
                    type: "text",
                    value: area || "Area"
                  },

                  body_6: {
                    type: "text",
                    value: rent || "0"
                  }
                }
              }
            ]
          }
        }
      },
      {
        headers: {
          accept: "application/json",
          authkey: AUTH_KEY,
          "content-type": "application/json"
        }
      }
    );

    console.log("================================");
    console.log("✅ WHATSAPP SENT SUCCESSFULLY");
    console.log(`📞 Owner: ${ownerPhone}`);
    console.log("================================");

    return res.status(200).json({
      success: true,
      message: "WhatsApp message sent",
      data: response.data
    });

  } catch (error) {

    console.log("================================");
    console.log("❌ WHATSAPP ERROR");
    console.log("================================");

    if (error.response) {
      console.log(error.response.data);

      return res.status(error.response.status).json({
        success: false,
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