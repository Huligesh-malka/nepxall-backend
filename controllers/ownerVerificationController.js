const db = require("../db");
const axios = require("axios");
const { getAccessToken } = require("../services/sandboxAuth");

/**
 * Helper to format headers. 
 * Ensure SANDBOX_API_VERSION is "1.0.0" for O-KYC unless your dashboard says otherwise.
 */
const getHeaders = (token) => ({
  "Authorization": `Bearer ${token}`,
  "x-api-key": process.env.SANDBOX_API_KEY,
  "x-api-version": process.env.SANDBOX_API_VERSION || "1.0.0",
  "Content-Type": "application/json",
});

//////////////////////////////////////////////////
// SEND OTP
//////////////////////////////////////////////////
exports.sendAadhaarOtp = async (req, res) => {
  try {
    const userId = req.user.mysqlId;
    const { aadhaar_number } = req.body;

    // Validation
    if (!/^\d{12}$/.test(aadhaar_number)) {
      return res.status(400).json({ message: "Enter a valid 12-digit Aadhaar number" });
    }

    const token = await getAccessToken();

    const response = await axios.post(
      `${process.env.SANDBOX_BASE_URL}/kyc/aadhaar/okyc/otp`,
      {
        "@entity": "in.co.sandbox.kyc.aadhaar.okyc.otp.request",
        aadhaar_number,
        consent: "Y",
        reason: "Owner KYC Verification",
      },
      { headers: getHeaders(token) }
    );

    const refId = response.data?.data?.reference_id;
    if (!refId) throw new Error("Reference ID not received from Sandbox");

    await db.query(
      "UPDATE users SET aadhaar_ref_id=? WHERE id=?",
      [refId, userId]
    );

    return res.json({ success: true, message: "OTP sent successfully" });

  } catch (err) {
    // Specific debugging for the 403 Insufficient Privilege error
    if (err.response?.status === 403) {
      console.error("CRITICAL: Sandbox Account lacks permissions for Aadhaar O-KYC.");
      return res.status(403).json({ 
        message: "Service access denied. Please check Sandbox API permissions." 
      });
    }

    console.error("SEND OTP ERROR:", err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({ 
      message: err.response?.data?.message || "Failed to initiate Aadhaar verification" 
    });
  }
};

//////////////////////////////////////////////////
// VERIFY OTP
//////////////////////////////////////////////////
exports.verifyAadhaarOtp = async (req, res) => {
  try {
    const userId = req.user.mysqlId;
    const { otp } = req.body;

    if (!otp) return res.status(400).json({ message: "OTP is required" });

    // Fetch reference ID
    const [rows] = await db.query(
      "SELECT aadhaar_ref_id FROM users WHERE id=?",
      [userId]
    );
    const ref = rows[0];

    if (!ref?.aadhaar_ref_id) {
      return res.status(400).json({ message: "Session expired. Please request a new OTP." });
    }

    const token = await getAccessToken();

    const response = await axios.post(
      `${process.env.SANDBOX_BASE_URL}/kyc/aadhaar/okyc/verify`,
      {
        "@entity": "in.co.sandbox.kyc.aadhaar.okyc.verify.request",
        reference_id: ref.aadhaar_ref_id,
        otp,
      },
      { headers: getHeaders(token) }
    );

    // Extracting user name from verified Aadhaar data
    const nameFromAadhaar = response.data?.data?.name;

    await db.query(
      `UPDATE users 
       SET aadhaar_verified=1, 
           name=?, 
           owner_verification_status='verified' 
       WHERE id=?`,
      [nameFromAadhaar, userId]
    );

    return res.json({ 
      success: true, 
      message: "Aadhaar verified successfully", 
      name: nameFromAadhaar 
    });

  } catch (err) {
    console.error("VERIFY OTP ERROR:", err.response?.data || err.message);
    
    // Handle specific Sandbox errors (e.g., Wrong OTP)
    const errorMsg = err.response?.data?.message || "OTP verification failed";
    return res.status(err.response?.status || 500).json({ message: errorMsg });
  }
};

//////////////////////////////////////////////////
// STATUS
//////////////////////////////////////////////////
exports.getVerificationStatus = async (req, res) => {
  try {
    const userId = req.user.mysqlId;
    const [rows] = await db.query(
      "SELECT aadhaar_verified, owner_verification_status FROM users WHERE id=?",
      [userId]
    );

    if (rows.length === 0) return res.status(404).json({ message: "User not found" });

    return res.json({
      success: true,
      status: rows[0].owner_verification_status,
      aadhaar_verified: rows[0].aadhaar_verified === 1,
    });
  } catch (err) {
    console.error("STATUS ERROR:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};  