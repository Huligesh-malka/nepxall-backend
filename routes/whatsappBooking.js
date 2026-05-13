const express = require("express");
const axios = require("axios");

const router = express.Router();

const db = require("../config/db");

/*
==================================================
 SEND BOOKING WHATSAPP
==================================================
*/

router.post("/send-booking-whatsapp", async (req, res) => {

  try {

    console.log("📩 BODY:", req.body);

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
    GET OWNER
    ==========================================
    */

    db.query(
      `
      SELECT id, name, phone
      FROM users
      WHERE id = ?
      `,
      [ownerId],

      async (err, owners) => {

        if (err) {

          console.log("DB ERROR:", err);

          return res.status(500).json({
            success: false,
            message: "Database error"
          });

        }

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

        console.log("📞 OWNER PHONE:", ownerPhone);

        const AUTH_KEY =
          process.env.MSG91_AUTH_KEY;

        const WHATSAPP_NUMBER =
          process.env.MSG91_WHATSAPP_NUMBER;

        /*
        ==========================================
        SEND WHATSAPP
        ==========================================
        */

        try {

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

          console.log("✅ WhatsApp Sent");

          return res.status(200).json({
            success: true,
            message: "WhatsApp sent successfully",
            data: response.data
          });

        } catch (whatsappError) {

          console.log(
            "MSG91 ERROR:",
            whatsappError.response?.data ||
            whatsappError.message
          );

          return res.status(500).json({
            success: false,
            message:
              whatsappError.response?.data ||
              whatsappError.message
          });

        }

      }
    );

  } catch (error) {

    console.log("SERVER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }

});

module.exports = router;