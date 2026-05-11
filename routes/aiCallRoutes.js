const express = require("express");
const axios = require("axios");
const router = express.Router();

router.post("/call-owner", async (req, res) => {
  try {
    let { phoneNumber, ownerName } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: "Phone number required" });
    }

    // Clean number logic
    phoneNumber = phoneNumber.replace(/\D/g, '');
    if (phoneNumber.startsWith('91') && phoneNumber.length > 10) {
      phoneNumber = phoneNumber.substring(2);
    }

    const AUTH_KEY = process.env.MSG91_AUTH_KEY;
    
    if (!AUTH_KEY) {
      return res.status(500).json({ success: false, message: "Server configuration error: Key Missing" });
    }

    const requestBody = {
      flow_id: "2589",
      recipient: [`91${phoneNumber}`],
      short_description: `Call to ${ownerName || 'Owner'}`,
    };

    console.log("=================================");
    console.log("📞 TRYING MULTI-AUTH CALL");
    console.log("📱 Target:", `91${phoneNumber}`);
    console.log("=================================");

    // THE FIX: We are sending the key in the Header AND the Params 
    // AND using the Bearer format which is common for newer Voice AI nodes.
    const response = await axios({
      method: "POST",
      url: "https://voice.phone91.com/call/",
      params: {
        authkey: AUTH_KEY // Try 1: Query Param
      },
      headers: {
        "authkey": AUTH_KEY,                 // Try 2: Standard Header
        "Authorization": `Bearer ${AUTH_KEY}`, // Try 3: Bearer Token (Highly Likely)
        "Content-Type": "application/json",
        "accept": "application/json",
      },
      data: requestBody,
    });

    if (response.data.status === 'fail' || response.data.hasError) {
      return res.status(401).json({
        success: false,
        message: "AI Call Provider Error",
        error: response.data.errors || response.data.message
      });
    }

    return res.status(200).json({
      success: true,
      message: "AI Call Started Successfully",
      data: response.data,
    });

  } catch (error) {
    console.log("❌ API RESPONSE ERROR:", error.response?.data);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Call connection failed",
      error: error.response?.data || error.message,
    });
  }
});

module.exports = router;