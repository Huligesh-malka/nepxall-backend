const axios = require("axios");

const sendBookingSMS = async (ownerPhone, pgName, userName, userPhone) => {
  try {
    await axios.post(
      "https://control.msg91.com/api/v5/flow/",
      {
        flow_id: process.env.MSG91_FLOW_ID,
        sender: "NEXPAL",
        mobiles: "91" + ownerPhone,
        pg_name: pgName,
        user_name: userName,
        user_phone: userPhone
      },
      {
        headers: {
          authkey: process.env.MSG91_AUTH_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ SMS sent to owner");
  } catch (err) {
    console.error("❌ SMS error:", err.response?.data || err.message);
  }
};

module.exports = sendBookingSMS;