const express = require("express");
const axios = require("axios");
const router = express.Router();

router.post("/call-owner", async (req, res) => {
  try {
    let { phoneNumber, ownerName } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: "Phone number required" });
    }

    // Clean number: Ensure it is just digits
    phoneNumber = phoneNumber.replace(/\D/g, '');
    if (phoneNumber.startsWith('91') && phoneNumber.length > 10) {
      phoneNumber = phoneNumber.substring(2);
    }

    const AUTH_KEY = process.env.MSG91_AUTH_KEY;
    
    // ==========================================
    // DATA STRUCTURE BASED ON YOUR DOCS
    // ==========================================
    const requestBody = {
      template: "2589", // Using your ID here as the template
      caller_id: "917483090510", // This must be a verified caller ID in your MSG91 panel
      client_number: `91${phoneNumber}`,
      variables: {
        owner_name: ownerName || "Owner"
      }
    };

    console.log("=================================");
    console.log("📞 CALLING VIA MSG91 V5 API");
    console.log("📱 Target:", `91${phoneNumber}`);
    console.log("=================================");

    const response = await axios({
      method: "POST",
      url: "https://control.msg91.com/api/v5/voice/call/", // UPDATED URL
      headers: {
        "authkey": AUTH_KEY,
        "accept": "application/json",
        "content-type": "application/json",
      },
      data: requestBody,
    });

    console.log("✅ MSG91 RESPONSE:", response.data);

    return res.status(200).json({
      success: true,
      message: "AI Call Processed",
      data: response.data,
    });

  } catch (error) {
    console.log("❌ MSG91 V5 ERROR:", error.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Call failed",
      error: error.response?.data || error.message,
    });
  }
});

module.exports = router;