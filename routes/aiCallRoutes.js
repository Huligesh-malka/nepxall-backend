const express = require("express");
const axios = require("axios");
const router = express.Router();

/*
==================================================
 AI OWNER CALL ROUTE (MSG91 V5)
==================================================
*/
router.post("/call-owner", async (req, res) => {
  try {
    let { phoneNumber, ownerName } = req.body;

    // 1. Validation & Sanitization
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: "Phone number required" });
    }

    // Clean number: ensure digits only
    phoneNumber = phoneNumber.replace(/\D/g, '');
    
    // Normalize to 10 digits (strip leading 91 or 0)
    if (phoneNumber.startsWith('91') && phoneNumber.length > 10) {
      phoneNumber = phoneNumber.substring(2);
    } else if (phoneNumber.startsWith('0') && phoneNumber.length > 10) {
      phoneNumber = phoneNumber.substring(1);
    }

    const AUTH_KEY = process.env.MSG91_AUTH_KEY;
    if (!AUTH_KEY) {
      return res.status(500).json({ success: false, message: "Server configuration error" });
    }

    // 2. MSG91 V5 Structured Request Body
    const requestBody = {
      template: "2589",
      // FIXED: This must be your verified MSG91 number.
      // Think of this as the "Office Number" making the call.
      caller_id: "917483090510", 
      
      // DYNAMIC: This is the owner's number you want to reach.
      // This will work for ANY number you pass from the frontend.
      client_number: `91${phoneNumber}`, 
      
      variables: {
        owner_name: {
          type: "text",
          value: ownerName || "Owner"
        }
      }
    };

    console.log("=================================");
    console.log(`📞 INITIATING CALL TO: 91${phoneNumber}`);
    console.log(`👤 OWNER NAME: ${ownerName}`);
    console.log("=================================");

    // 3. API Execution
    const response = await axios({
      method: "POST",
      url: "https://control.msg91.com/api/v5/voice/call/",
      headers: {
        "authkey": AUTH_KEY,
        "accept": "application/json",
        "content-type": "application/json",
      },
      data: requestBody,
    });

    return res.status(200).json({
      success: true,
      message: "AI Call Processed Successfully",
      data: response.data,
    });

  } catch (error) {
    console.log("❌ MSG91 V5 API ERROR");
    if (error.response) {
      console.log("DETAIL:", JSON.stringify(error.response.data, null, 2));
      return res.status(error.response.status).json({
        success: false,
        message: "MSG91 V5 API Error",
        error: error.response.data,
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;