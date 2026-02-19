const axios = require("axios");
const db = require("../db");

const CLIENT_ID = process.env.CF_CLIENT_ID;
const CLIENT_SECRET = process.env.CF_CLIENT_SECRET;

// Note: Cashfree Sandbox often requires /v1/ or specific paths
const BASE_URL = "https://sandbox.cashfree.com/verification";

/* ======================================================
    🔹 GENERATE AADHAAR OTP
====================================================== */
exports.generateAadhaarOtp = async (req, res) => {
  try {
    const { aadhaar } = req.body;
    const firebaseUid = req.user.uid;

    if (!aadhaar || aadhaar.length !== 12) {
      return res.status(400).json({ error: "Invalid Aadhaar Number" });
    }

    // UPDATED ENDPOINT: Cashfree verification usually follows this pattern
    const response = await axios.post(
      `${BASE_URL}/offline-aadhaar/otp`, 
      {
        aadhaar_number: aadhaar,
      },
      {
        headers: {
          "x-client-id": CLIENT_ID,
          "x-client-secret": CLIENT_SECRET,
          "x-api-version": "2022-09-01", // Recommended to add API version
          "Content-Type": "application/json"
        }
      }
    );

    const refId = response.data.ref_id;

    await db.query(
      "UPDATE users SET aadhaar_ref_id=? WHERE firebase_uid=?",
      [refId, firebaseUid]
    );

    res.json({
      success: true,
      message: "OTP sent successfully",
      ref_id: refId
    });

  } catch (err) {
    // This will now show you the specific reason from Cashfree (e.g., "Invalid Aadhaar")
    console.error("CASHFREE ERROR DETAILS:", err.response?.data || err.message);

    res.status(err.response?.status || 500).json({
      error: err.response?.data?.message || "Cashfree API Error: 404 Not Found"
    });
  }
};

/* ======================================================
    🔹 VERIFY AADHAAR OTP
====================================================== */
exports.verifyAadhaarOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const firebaseUid = req.user.uid;

    const [rows] = await db.query(
      "SELECT aadhaar_ref_id FROM users WHERE firebase_uid=?",
      [firebaseUid]
    );
    
    const user = rows[0];

    if (!user?.aadhaar_ref_id) {
      return res.status(400).json({ error: "No active session. Generate OTP first." });
    }

    const response = await axios.post(
      `${BASE_URL}/offline-aadhaar/verify`,
      {
        ref_id: user.aadhaar_ref_id,
        otp: otp
      },
      {
        headers: {
          "x-client-id": CLIENT_ID,
          "x-client-secret": CLIENT_SECRET,
          "x-api-version": "2022-09-01",
          "Content-Type": "application/json"
        }
      }
    );

    // ✅ MARK USER VERIFIED
    await db.query(
      "UPDATE users SET aadhaar_verified=1 WHERE firebase_uid=?",
      [firebaseUid]
    );

    res.json({
      success: true,
      message: "Aadhaar verified successfully",
      data: response.data
    });

  } catch (err) {
    console.error("VERIFY OTP ERROR:", err.response?.data || err.message);
    res.status(500).json({
      error: err.response?.data?.message || "OTP verification failed"
    });
  }
};

/* ======================================================
    🔹 GET KYC STATUS
====================================================== */
exports.getKycStatus = async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const [rows] = await db.query(
      "SELECT aadhaar_verified FROM users WHERE firebase_uid=?",
      [firebaseUid]
    );

    res.json({
      verified: rows[0]?.aadhaar_verified || 0
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch KYC status" });
  }
};