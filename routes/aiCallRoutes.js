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
    let { phoneNumber, ownerName } = req.body;

    // 1. Validation & Sanitization
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: "Phone number required" });
    }

    // Clean number: remove non-digits
    phoneNumber = phoneNumber.replace(/\D/g, '');
    
    // Ensure 10 digits (strip leading 91 or 0 if present)
    if (phoneNumber.startsWith('91') && phoneNumber.length > 10) {
      phoneNumber = phoneNumber.substring(2);
    } else if (phoneNumber.startsWith('0') && phoneNumber.length > 10) {
      phoneNumber = phoneNumber.substring(1);
    }

    const AUTH_KEY = process.env.MSG91_AUTH_KEY;
    
    if (!AUTH_KEY) {
      console.error("❌ MSG91_AUTH_KEY missing in environment");
      return res.status(500).json({ success: false, message: "Server configuration error" });
    }

    // 2. Request Setup
    const requestBody = {
      flow_id: "2589",
      recipient: [`91${phoneNumber}`],
      short_description: `Call to ${ownerName || 'Owner'}`,
    };

    console.log("=================================");
    console.log("📞 ATTEMPTING AI CALL VIA PHONE91");
    console.log("📱 Target:", `91${phoneNumber}`);
    console.log("=================================");

    // 3. MSG91 / PHONE91 API CALL
    // KEY FIX: Passing authkey as a query parameter (params)
    const response = await axios({
      method: "POST",
      url: "https://voice.phone91.com/call/",
      params: {
        authkey: AUTH_KEY
      },
      headers: {
        "Content-Type": "application/json",
        "accept": "application/json",
      },
      data: requestBody,
    });

    // 4. Handle Response
    if (response.data.status === 'fail' || response.data.hasError) {
      console.log("❌ PHONE91 REJECTED:", response.data.errors);
      return res.status(401).json({
        success: false,
        message: "AI Call Provider Unauthorized",
        error: response.data.errors || "Invalid AuthKey or Flow ID"
      });
    }

    console.log("✅ AI CALL SUCCESS:", response.data);
    return res.status(200).json({
      success: true,
      message: "AI Call Started Successfully",
      data: response.data,
    });

  } catch (error) {
    console.log("=================================");
    console.log("❌ API CONNECTION ERROR");
    if (error.response) {
      console.log("❌ DATA:", error.response.data);
      return res.status(error.response.status).json({
        success: false,
        message: "Provider Connection Error",
        error: error.response.data,
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;