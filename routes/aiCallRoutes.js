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

    // 1. Validation
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number required",
      });
    }

    // 2. Config & Env Check
    const AUTH_KEY = process.env.MSG91_AUTH_KEY;
    
    if (!AUTH_KEY) {
        console.error("❌ ERROR: MSG91_AUTH_KEY is missing from environment variables.");
        return res.status(500).json({ success: false, message: "Server configuration error" });
    }

    console.log("=================================");
    console.log("📞 STARTING AI OWNER CALL");
    console.log("📱 Phone:", phoneNumber);
    console.log("👤 Owner:", ownerName || "N/A");
    console.log("=================================");

    const requestBody = {
      flow_id: "2589",
      recipient: [`91${phoneNumber}`],
    };

    // 3. MSG91 / PHONE91 API CALL
    const response = await axios({
      method: "POST",
      url: "https://voice.phone91.com/call/",
      headers: {
        "authkey": AUTH_KEY, // Ensure this matches MSG91 documentation (sometimes it's 'authkey', sometimes 'auth-key')
        "Content-Type": "application/json",
        "accept": "application/json",
      },
      data: requestBody,
    });

    // 4. Handle MSG91's internal error format
    // Note: Some APIs return 200 OK but include 'status: fail' in the body
    if (response.data.status === 'fail' || response.data.hasError) {
        console.log("❌ MSG91 REJECTED REQUEST:", response.data.errors);
        return res.status(401).json({
            success: false,
            message: "AI Call Provider Error",
            error: response.data.errors
        });
    }

    console.log("✅ AI CALL SUCCESS");
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
        message: "MSG91 API Error",
        error: error.response.data,
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;