const axios = require("axios");

const BASE_URL = process.env.SUREPASS_BASE_URL || "https://sandbox.surepass.app/api/v1";
const TOKEN = process.env.SUREPASS_TOKEN;
const FRONTEND_URL = process.env.FRONTEND_URL;

if (!TOKEN) {
  console.error("❌ Missing SUREPASS_TOKEN in environment variables");
}

/* =========================================
   🔐 GENERATE DIGILOCKER LINK
========================================= */

exports.getDigilockerLink = async (req, res) => {
  try {

    const response = await axios.post(
      `${BASE_URL}/digilocker/link`,
      {
        redirect_url: `${FRONTEND_URL}/digilocker/callback`
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    return res.json({
      success: true,
      data: response.data
    });

  } catch (error) {

    console.error("🔥 DigiLocker Link Error:", error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to generate DigiLocker link"
    });
  }
};

/* =========================================
   📄 FETCH DIGILOCKER USER DATA
========================================= */

exports.fetchDigilockerData = async (req, res) => {
  try {

    const { client_id } = req.body;

    if (!client_id) {
      return res.status(400).json({
        success: false,
        message: "client_id is required"
      });
    }

    const response = await axios.post(
      `${BASE_URL}/digilocker/fetch`,
      { client_id },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    return res.json({
      success: true,
      data: response.data
    });

  } catch (error) {

    console.error("🔥 DigiLocker Fetch Error:", error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch DigiLocker data"
    });
  }
};