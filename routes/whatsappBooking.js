const express = require("express");
const axios = require("axios");

const router = express.Router();

/*
==================================================
 TEST ROUTE
==================================================
*/

router.get("/send-booking-whatsapp", (req, res) => {
  res.json({
    success: true,
    message: "✅ WhatsApp API working. Use POST request."
  });
});

/*
==================================================
 SEND WHATSAPP BOOKING MESSAGE
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

    // Remove country code if already exists
    if (ownerPhone.startsWith("91") && ownerPhone.length > 10) {
      ownerPhone = ownerPhone.substring(2);
    }

    const AUTH_KEY = process.env.MSG91_AUTH_KEY;
    const WHATSAPP_NUMBER = process.env.MSG91_WHATSAPP_NUMBER;

    /*
    ==========================================
    ENV CHECK
    ==========================================
    */

    if (!AUTH_KEY || !WHATSAPP_NUMBER) {
      return res.status(500).json({
        success: false,
        message: "MSG91 ENV variables missing"
      });
    }

    /*
    ==========================================
    SEND TEMPLATE MESSAGE
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
            name: "booking_notification",

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
                    value: String(rent || "0")
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

    /*
    ==========================================
    SUCCESS
    ==========================================
    */

    console.log("================================");
    console.log("✅ WHATSAPP SENT SUCCESSFULLY");
    console.log(`📞 Sent To: ${ownerPhone}`);
    console.log("================================");

    return res.status(200).json({
      success: true,
      message: "WhatsApp message sent successfully",
      data: response.data
    });

  } catch (error) {

    console.log("================================");
    console.log("❌ WHATSAPP API ERROR");
    console.log("================================");

    if (error.response) {

      console.log(error.response.data);

      return res.status(error.response.status).json({
        success: false,
        message: "MSG91 API Error",
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