const express = require("express");
const axios = require("axios");

const router = express.Router();

/*
==================================================
 AI OWNER CALL ROUTE
==================================================
*/

router.post("/call-owner", async (req, res) => {
  try {
    const { phoneNumber, ownerName } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number required",
      });
    }

    // ==============================
    // MSG91 CONFIG
    // ==============================

    const AUTH_KEY = process.env.MSG91_AUTH_KEY;

    // ==============================
    // AI VOICE MESSAGE
    // ==============================

    const voiceMessage = `
    Hello ${ownerName || "Owner"}.
    This call is from Nepxall.

    We want to add your PG or coliving property
    on Nepxall platform.

    Please tell your room details after the beep.

    What is your PG name?

    What is single sharing price?

    What is double sharing price?

    Is food available?

    Which area is your PG located?

    Thank you.
    `;

    // ==============================
    // MSG91 API CALL
    // ==============================

    const response = await axios.post(
      "https://voice.msg91.com/api/v1/call/",
      {
        flow_id: "YOUR_FLOW_ID",
        sender: "NEPXAL",
        mobiles: `91${phoneNumber}`,
        voice: "female",
        message: voiceMessage,
      },
      {
        headers: {
          authkey: AUTH_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    return res.json({
      success: true,
      message: "AI Call Started",
      data: response.data,
    });

  } catch (error) {
    console.log(error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      message: "Call failed",
      error: error.response?.data || error.message,
    });
  }
});

module.exports = router;