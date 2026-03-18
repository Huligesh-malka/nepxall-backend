// controllers/agreementsFormController.js
const db = require("../db");

exports.submitAgreementForm = async (req) => {
  console.log("📥 --- Processing Full Agreement Submission ---");

  try {
    const {
      user_id, booking_id, full_name, father_name, dob, mobile, email,
      occupation, company_name, address, city, state, pincode,
      aadhaar_number, pan_number, checkin_date, agreement_months,
      rent, deposit, maintenance
    } = req.body;

    const files = req.files || {};

    // Helper for integers
    const toSafeInt = (val) => {
      if (val === "undefined" || val === "" || val === null) return null;
      const parsed = parseInt(val);
      return isNaN(parsed) ? null : parsed;
    };

    // Extracting Cloudinary Paths
    const aadhaar_front = files['aadhaar_front']?.[0]?.path || null;
    const aadhaar_back = files['aadhaar_back']?.[0]?.path || null;
    const pan_card = files['pan_card']?.[0]?.path || null;
    const signature = files['signature']?.[0]?.path || null;

    const sql = `
      INSERT INTO agreements_form (
        user_id, booking_id, full_name, father_name, dob, mobile, email,
        occupation, company_name, address, city, state, pincode,
        aadhaar_number, aadhaar_front, aadhaar_back, pan_number, pan_card,
        checkin_date, agreement_months, rent, deposit, maintenance,
        signature, agreement_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      toSafeInt(user_id),
      toSafeInt(booking_id),
      full_name || null,
      father_name || null,
      dob || null, // Ensure YYYY-MM-DD format from frontend
      mobile || null,
      email || null,
      occupation || null,
      company_name || null,
      address || null,
      city || null,
      state || null,
      pincode || null,
      aadhaar_number || null,
      aadhaar_front,
      aadhaar_back,
      pan_number || null,
      pan_card,
      checkin_date || null,
      toSafeInt(agreement_months),
      toSafeInt(rent),
      toSafeInt(deposit),
      toSafeInt(maintenance),
      signature,
      'form_submitted'
    ];

    const [result] = await db.query(sql, values);
    
    console.log("✅ Full Agreement Saved. ID:", result.insertId);
    return { insertId: result.insertId };

  } catch (error) {
    console.error("❌ Controller Error:", error.message);
    throw error; 
  }
};