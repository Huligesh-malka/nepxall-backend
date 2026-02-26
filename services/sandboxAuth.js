const axios = require("axios");

exports.getAccessToken = async () => {
  try {
    const res = await axios.post(
      `${process.env.SANDBOX_BASE_URL}/authenticate`,
      {},
      {
        headers: {
          "x-api-key": process.env.SANDBOX_API_KEY,
          "x-api-secret": process.env.SANDBOX_API_SECRET,
          "x-api-version": "1.0.0",
          "Content-Type": "application/json",
        },
      }
    );

    // Ensure the token exists before returning
    if (!res.data?.data?.access_token) {
      throw new Error("Failed to retrieve access token from Sandbox");
    }

    return res.data.data.access_token;
  } catch (error) {
    console.error("SANDBOX AUTH ERROR:", error.response?.data || error.message);
    throw error;
  }
};