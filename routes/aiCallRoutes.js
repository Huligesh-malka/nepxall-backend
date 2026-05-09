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
    // MSG91 / PHONE91 CONFIG
    // ==============================

    const AUTH_KEY = process.env.MSG91_AUTH_KEY;

    console.log("📞 Calling Owner:", phoneNumber);
    console.log("👤 Owner Name:", ownerName);
    console.log("🔑 AUTH KEY:", AUTH_KEY ? "FOUND" : "MISSING");

    // ==============================
    // PHONE91 API CALL
    // ==============================

    const response = await axios.post(
      "https://voice.phone91.com/api/v1/create-call",
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

    // ==============================
    // SUCCESS
    // ==============================

    console.log("✅ CALL RESPONSE:");
    console.log(response.data);

    return res.status(200).json({
      success: true,
      message: "AI Call Started Successfully",
      data: response.data,
    });

  } catch (error) {

    console.log("❌ CALL ERROR");

    if (error.response) {

      console.log("❌ RESPONSE DATA:");
      console.log(error.response.data);

      return res.status(500).json({
        success: false,
        message: "Phone91 API Error",
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