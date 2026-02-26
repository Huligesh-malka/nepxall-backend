const axios = require("axios");
const db = require("../db");

const CLIENT_ID = process.env.CF_CLIENT_ID;
const CLIENT_SECRET = process.env.CF_CLIENT_SECRET;

const BASE_URL = "https://sandbox.cashfree.com/verification";

//////////////////////////////////////////////////////
// 👤 GET USER PROFILE (AUTO FILL)
//////////////////////////////////////////////////////
exports.getKycProfile = async (req, res) => {
  const [rows] = await db.query(
    `SELECT name, email, phone, gender, dob, address
     FROM users
     WHERE firebase_uid=?`,
    [req.user.uid]
  );

  res.json(rows[0] || {});
};

//////////////////////////////////////////////////////
// 📩 SEND OTP
//////////////////////////////////////////////////////
exports.generateAadhaarOtp = async (req, res) => {
  const { aadhaar } = req.body;

  const response = await axios.post(
    `${BASE_URL}/offline-aadhaar/otp`,
    { aadhaar_number: aadhaar },
    {
      headers: {
        "x-client-id": CLIENT_ID,
        "x-client-secret": CLIENT_SECRET,
        "x-api-version": "2022-09-01",
      },
    }
  );

  await db.query(
    "UPDATE users SET aadhaar_ref_id=? WHERE firebase_uid=?",
    [response.data.ref_id, req.user.uid]
  );

  res.json({ success: true });
};

//////////////////////////////////////////////////////
// ✅ VERIFY OTP + SAVE USER DATA
//////////////////////////////////////////////////////
exports.verifyAadhaarOtp = async (req, res) => {
  const { otp, bookingId, name, dob, gender, address } = req.body;

  const [rows] = await db.query(
    "SELECT aadhaar_ref_id FROM users WHERE firebase_uid=?",
    [req.user.uid]
  );

  const refId = rows[0]?.aadhaar_ref_id;

  await axios.post(
    `${BASE_URL}/offline-aadhaar/verify`,
    { ref_id: refId, otp },
    {
      headers: {
        "x-client-id": CLIENT_ID,
        "x-client-secret": CLIENT_SECRET,
        "x-api-version": "2022-09-01",
      },
    }
  );

  //////////////////////////////////////////////////
  // 🧾 UPDATE USER
  //////////////////////////////////////////////////
  await db.query(
    `UPDATE users
     SET name=?, dob=?, gender=?, address=?, aadhaar_verified=1
     WHERE firebase_uid=?`,
    [name, dob, gender, address, req.user.uid]
  );

  //////////////////////////////////////////////////
  // 🏠 UPDATE BOOKING
  //////////////////////////////////////////////////
  await db.query(
    "UPDATE bookings SET kyc_verified=1 WHERE id=?",
    [bookingId]
  );

  res.json({ success: true });
};