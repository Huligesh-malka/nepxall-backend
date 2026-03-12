const axios = require("axios");

const BASE_URL = process.env.SUREPASS_BASE_URL;
const TOKEN = process.env.SUREPASS_TOKEN;
const FRONTEND_URL = process.env.FRONTEND_URL;

/* ===============================
   🔐 GENERATE DIGILOCKER LINK
================================ */

exports.getDigilockerLink = async (req, res) => {

  try {

    if (!BASE_URL || !TOKEN || !FRONTEND_URL) {
      console.error("Missing environment variables");

      return res.status(500).json({
        success: false,
        message: "Server configuration error"
      });
    }

    const response = await axios.post(
      `${BASE_URL}/digilocker/link`,
      {
        redirect_url: `${FRONTEND_URL}/digilocker/callback`,
        skip_main_screen: true,
        signup_flow: true
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    console.log("Surepass DigiLocker response:", response.data);

    return res.json({
      success: true,
      url: response.data?.data?.url || response.data?.url
    });

  } catch (error) {

    console.error(
      "Digilocker API error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to generate DigiLocker link"
    });
  }

};


/* ===============================
   📄 FETCH DIGILOCKER DATA
================================ */

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

    console.log("DigiLocker fetch response:", response.data);

    return res.json({
      success: true,
      data: response.data
    });

  } catch (error) {

    console.error(
      "Digilocker fetch error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to fetch DigiLocker data"
    });
  }

};