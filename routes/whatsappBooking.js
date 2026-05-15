const express = require("express");
const axios = require("axios");

const router = express.Router();

const db = require("../db");

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
    CLEAN PHONE NUMBER
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
    SEND TEMPLATE WHATSAPP
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

            name: "booking_notification_v2",

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
                    value: owner.name || "Owner"
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