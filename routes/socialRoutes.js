const express = require("express");
const router = express.Router();
const axios = require("axios");

/* ================= CONNECT INSTAGRAM ================= */

router.post("/connect-instagram", async (req, res) => {
  try {
    const { accessToken, instagramId } = req.body;

    // Save token in database later

    res.json({
      success: true,
      message: "Instagram connected successfully",
      accessToken,
      instagramId
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Instagram connection failed"
    });
  }
});

/* ================= GET INSTAGRAM POSTS ================= */

router.get("/instagram-posts/:igUserId", async (req, res) => {
  try {
    const { igUserId } = req.params;
    const accessToken = req.headers.authorization;

    const response = await axios.get(
      `https://graph.facebook.com/v23.0/${igUserId}/media`,
      {
        params: {
          fields: "id,caption,media_url,media_type,timestamp",
          access_token: accessToken
        }
      }
    );

    res.json({
      success: true,
      posts: response.data.data
    });

  } catch (error) {
    console.error(error.response?.data || error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch Instagram posts"
    });
  }
});

/* ================= CREATE AI POST ================= */

router.post("/generate-post", async (req, res) => {
  try {
    const { businessType, offer } = req.body;

    const caption = `
🔥 ${offer}

Visit us today and enjoy amazing offers!

#${businessType}
#Offer
#LocalBusiness
`;

    res.json({
      success: true,
      caption
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "AI post generation failed"
    });
  }
});

module.exports = router;