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
    // MSG91 VOICE API
    // =====================================

    const response = await axios({
      method: "POST",
      url: "https://control.msg91.com/api/v5/voice/call",
      maxRedirects: 5,
      headers: {
        authkey: AUTH_KEY,
        "Content-Type": "application/json",
      },
      data: {
        flow_id: "2589",
        mobile: `91${phoneNumber}`,
      },
    });

    console.log("=================================");
    console.log("✅ CALL RESPONSE");
    console.log(response.data);
    console.log("=================================");

    return res.status(200).json({
      success: true,
      message: "AI Call Started Successfully",
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
        message: "MSG91 API Error",
        error: error.response.data,
      });
    }

    console.log("❌ ERROR:", error.message);

    return res.status(500).json({
      success: false,
      message: "Call failed",
      error: error.message,
    });
  }
});

module.exports = router;