const axios = require("axios");

const BASE_URL = process.env.SUREPASS_BASE_URL;
const TOKEN = process.env.SUREPASS_TOKEN;
const FRONTEND_URL = process.env.FRONTEND_URL;

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
        }
      }
    );

    console.log("Surepass response:", response.data);

    res.json({
      success: true,
      data: response.data
    });

  } catch (error) {

    console.error(
      "Digilocker API error:",
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      message: "Unable to generate DigiLocker link"
    });

  }
};