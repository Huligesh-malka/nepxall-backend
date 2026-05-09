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

    // ==============================
    // VALIDATION
    // ==============================

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

    console.log("📞 Calling Owner:", phoneNumber);
    console.log("👤 Owner Name:", ownerName);
    console.log("🔑 MSG91 KEY:", AUTH_KEY ? "FOUND" : "MISSING");

    // ==============================
    // AI MESSAGE
    // ==============================

    const voiceMessage = `
Hello ${ownerName || "Owner"}.

This call is from Nepxall.

We want to add your PG or coliving property on Nepxall platform.

Please share your PG details.

What is your PG name?

What is single sharing price?

What is double sharing price?

Is food available?

Which area is your PG located?

Thank you.
`;

    console.log("🗣️ Voice Message Ready");

    // ==============================
    // MSG91 API CALL
    // ==============================

    const response = await axios.post(
      "https://control.msg91.com/api/v5/voice/call",
      {
        flow_id: "2589",
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

    // ==============================
    // SUCCESS
    // ==============================

    console.log("✅ MSG91 RESPONSE:");
    console.log(response.data);

    return res.status(200).json({
      success: true,
      message: "AI Call Started Successfully",
      data: response.data,
    });

  } catch (error) {

    console.log("❌ MSG91 ERROR");

    if (error.response) {

      console.log("❌ RESPONSE DATA:");
      console.log(error.response.data);

      return res.status(500).json({
        success: false,
        message: "MSG91 API Error",
        error: error.response.data,
      });
    }

    console.log("❌ ERROR MESSAGE:");
    console.log(error.message);

    return res.status(500).json({
      success: false,
      message: "Call failed",
      error: error.message,
    });
  }
});

module.exports = router;