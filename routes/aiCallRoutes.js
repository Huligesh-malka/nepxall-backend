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
    console.log("=================================");

    // =====================================
    // MSG91 VOICE FLOW API
    // =====================================

    const response = await axios.post(
      "https://control.msg91.com/api/v5/voice/call",
      {
        flow_id: "2589",
        mobile: `91${phoneNumber}`,
      },
      {
        headers: {
          authkey: AUTH_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ RESPONSE:");
    console.log(response.data);

    return res.status(200).json({
      success: true,
      message: "AI Call Started",
      data: response.data,
    });

  } catch (error) {

    console.log("=================================");
    console.log("❌ AI CALL ERROR");
    console.log("=================================");

    if (error.response) {

      console.log("❌ STATUS:", error.response.status);
      console.log("❌ DATA:");
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