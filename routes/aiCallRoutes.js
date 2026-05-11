const express = require("express");
const axios = require("axios");
const router = express.Router();

router.post("/call-owner", async (req, res) => {
  try {
    let { phoneNumber, ownerName } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: "Phone number required" });
    }

    // Clean number: remove non-digits and strip leading 91/0
    phoneNumber = phoneNumber.replace(/\D/g, '');
    if (phoneNumber.startsWith('91') && phoneNumber.length > 10) {
      phoneNumber = phoneNumber.substring(2);
    } else if (phoneNumber.startsWith('0') && phoneNumber.length > 10) {
      phoneNumber = phoneNumber.substring(1);
    }

    const AUTH_KEY = process.env.MSG91_AUTH_KEY;
    
    if (!AUTH_KEY) {
        return res.status(500).json({ success: false, message: "Server configuration error: Key Missing" });
    }

    const requestBody = {
      flow_id: "2589",
      recipient: [`91${phoneNumber}`],
      // Adding common AI variables in case the flow requires them
      short_description: `Call to ${ownerName || 'Owner'}`,
    };

    console.log("=================================");
    console.log("📞 ATTEMPTING AI CALL");
    console.log("📱 Target:", `91${phoneNumber}`);
    console.log("=================================");

    // THE FIX: Phone91 sometimes requires the key in the 'Authorization' header 
    // as a Bearer token, or specifically 'authkey' without a hyphen.
    const response = await axios({
      method: "POST",
      url: "https://voice.phone91.com/call/",
      headers: {
        "authkey": AUTH_KEY,             // Try 1
        "auth-key": AUTH_KEY,            // Try 2
        "Authorization": AUTH_KEY,       // Try 3 (Raw key)
        "Content-Type": "application/json",
        "accept": "application/json",
      },
      data: requestBody,
    });

    if (response.data.status === 'fail' || response.data.hasError) {
        return res.status(401).json({
            success: false,
            message: "Provider Auth Failed",
            error: response.data.errors
        });
    }

    return res.status(200).json({
      success: true,
      message: "AI Call Started",
      data: response.data,
    });

  } catch (error) {
    console.log("❌ API ERROR RESPONSE:", error.response?.data);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Call failed",
      error: error.response?.data || error.message,
    });
  }
});

module.exports = router;