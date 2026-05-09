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

    // ==============================
    // VALIDATION
    // ==============================

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number required",
      });
    }

    // ==============================
    // MSG91 CONFIG
    // ==============================

    const AUTH_KEY = process.env.MSG91_AUTH_KEY;

    console.log("=================================");
    console.log("📞 STARTING AI OWNER CALL");
    console.log("📱 Phone:", phoneNumber);
    console.log("👤 Owner:", ownerName || "N/A");
    console.log("🔑 AUTH KEY:", AUTH_KEY ? "FOUND" : "MISSING");
    console.log("=================================");

    // ==============================
    // API REQUEST
    // ==============================

    const requestBody = {
      flow_id: "2589",
      recipient: [`91${phoneNumber}`],
    };

    console.log("📤 REQUEST BODY:");
    console.log(requestBody);

    // ==============================
    // MSG91 CALL FLOW API
    // ==============================

    const response = await axios.post(
      "https://control.msg91.com/api/v5/call/flow",
      requestBody,
      {
        headers: {
          authkey: AUTH_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    // ==============================
    // SUCCESS
    // ==============================

    console.log("=================================");
    console.log("✅ CALL STARTED SUCCESSFULLY");
    console.log("📥 RESPONSE:");
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
      console.log("❌ RESPONSE DATA:");
      console.log(error.response.data);

      return res.status(500).json({
        success: false,
        message: "MSG91 API Error",
        error: error.response.data,
      });
    }

    console.log("❌ ERROR MESSAGE:");
    console.log(error.message);

    return res.status(500).json({
      success: false,
      message: "Call failed",
      error: error.message,
    });
  }
});

module.exports = router;