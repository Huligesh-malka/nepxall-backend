const express = require("express");
const axios = require("axios");

const router = express.Router();

router.post("/call-owner", async (req, res) => {

  try {

    const { phoneNumber, ownerName } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number required",
      });
    }

    const AUTH_KEY = process.env.MSG91_AUTH_KEY;

    console.log("=================================");
    console.log("📞 STARTING AI OWNER CALL");
    console.log("📱 Phone:", phoneNumber);
    console.log("👤 Owner:", ownerName || "N/A");
    console.log("🔑 AUTH KEY EXISTS:", AUTH_KEY ? "YES" : "NO");
    console.log("=================================");

    // FINAL BODY

    const requestBody = {
      flow_id: "2589",
      recipient: [`91${phoneNumber}`],
    };

    console.log("📤 REQUEST BODY:");
    console.log(requestBody);

    // FINAL API CALL

    const response = await axios.post(
      "https://voice.phone91.com/call/",
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${AUTH_KEY}`,
          accept: "application/json",
          "content-type": "application/json",
        },
      }
    );

    console.log("=================================");
    console.log("✅ AI CALL SUCCESS");
    console.log(response.data);
    console.log("=================================");

    return res.status(200).json({
      success: true,
      data: response.data,
    });

  } catch (error) {

    console.log("=================================");
    console.log("❌ AI CALL ERROR");
    console.log("=================================");

    if (error.response) {

      console.log("❌ STATUS:", error.response.status);
      console.log("❌ RESPONSE:");
      console.log(error.response.data);

      return res.status(500).json({
        success: false,
        error: error.response.data,
      });
    }

    console.log("❌ ERROR:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;