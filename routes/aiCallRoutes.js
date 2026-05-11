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
      return res.status(400).json({
        success: false,
        message: "Phone number required",
      });
    }

    // Remove any non-numeric characters (like +, spaces, or dashes)
    phoneNumber = phoneNumber.replace(/\D/g, '');

    // Ensure we don't double up on the country code '91'
    if (phoneNumber.startsWith('91') && phoneNumber.length > 10) {
        phoneNumber = phoneNumber.substring(2);
    }

    // 2. Config & Env Check
    const AUTH_KEY = process.env.MSG91_AUTH_KEY;
    
    if (!AUTH_KEY) {
        console.error("❌ ERROR: MSG91_AUTH_KEY is missing from environment variables.");
        return res.status(500).json({ success: false, message: "Server configuration error" });
    }

    console.log("=================================");
    console.log("📞 STARTING AI OWNER CALL");
    console.log("📱 Final Phone:", `91${phoneNumber}`);
    console.log("👤 Owner:", ownerName || "N/A");
    console.log("=================================");

    const requestBody = {
      flow_id: "2589",
      recipient: [`91${phoneNumber}`],
    };

    // 3. MSG91 / PHONE91 API CALL
    // FIX: Using 'auth-key' as the primary header for Phone91 Voice
    const response = await axios({
      method: "POST",
      url: "https://voice.phone91.com/call/",
      headers: {
        "auth-key": AUTH_KEY, 
        "authkey": AUTH_KEY, // Keeping this as fallback
        "Content-Type": "application/json",
        "accept": "application/json",
      },
      data: requestBody,
    });

    // 4. Handle MSG91's internal error format
    // MSG91 often returns 200 OK but with status: "fail" in the body
    if (response.data.status === 'fail' || response.data.hasError) {
        console.log("❌ MSG91 REJECTED REQUEST:", response.data.errors);
        return res.status(400).json({
            success: false,
            message: "AI Call Provider Error",
            error: response.data.errors || response.data.message
        });
    }

    console.log("✅ AI CALL SUCCESS");
    console.log("DATA:", response.data);
    
    return res.status(200).json({
      success: true,
      message: "AI Call Started Successfully",
      data: response.data,
    });

  } catch (error) {
    console.log("=================================");
    console.log("❌ SYSTEM ERROR");
    if (error.response) {
      console.log("❌ DATA:", error.response.data);
      return res.status(error.response.status).json({
        success: false,
        message: "MSG91 API Connection Error",
        error: error.response.data,
      });
    }
    console.log("❌ MESSAGE:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;