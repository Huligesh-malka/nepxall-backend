const db = require("../db");

exports.submitAgreementForm = async (req) => {
  console.log("📥 --- Processing Agreement Submission ---");

  try {
    const body = req.body;
    const files = req.files || {};

    // 🛠️ Helper: Prevent "undefined" or "" from crashing Integer columns
    const toSafeInt = (val) => {
      if (val === "undefined" || val === "" || val === null || val === undefined) return null;
      const parsed = parseInt(val);
      return isNaN(parsed) ? null : parsed;
    };

    // Extract Cloudinary URLs safely
    const aadhaar_front = files['aadhaar_front']?.[0]?.path || null;
    const pan_card = files['pan_card']?.[0]?.path || null;
    const signature = files['signature']?.[0]?.path || null;

    if (!body.full_name || !body.mobile) {
      throw new Error("Full name and mobile are required");
    }

    // This SQL matches your 'desc agreements_form' exactly (26 columns)
    const sql = `
      INSERT INTO agreements_form (
        user_id, booking_id, full_name, father_name, dob, 
        mobile, email, occupation, company_name, address, 
        city, state, pincode, aadhaar_number, aadhaar_last4, 
        aadhaar_front, aadhaar_back, pan_number, pan_card, 
        checkin_date, agreement_months, rent, deposit, 
        maintenance, signature, agreement_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      toSafeInt(body.user_id),
      toSafeInt(body.booking_id), // ✅ Fixes the 'undefined' crash
      body.full_name || null,
      body.father_name || null,
      body.dob || null,
      body.mobile || null,
      body.email || null,
      body.occupation || null,
      body.company_name || null,
      body.address || null,
      body.city || null,
      body.state || null,
      body.pincode || null,
      body.aadhaar_number || null,
      body.aadhaar_last4 || null,
      aadhaar_front,
      null, // aadhaar_back
      body.pan_number || null,
      pan_card,
      body.checkin_date || null,
      toSafeInt(body.agreement_months),
      toSafeInt(body.rent),
      toSafeInt(body.deposit),
      toSafeInt(body.maintenance),
      signature,
      'form_submitted'
    ];

    const result = await new Promise((resolve, reject) => {
      db.query(sql, values, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });

    console.log("✅ Database record created ID:", result.insertId);
    return { success: true, agreement_id: result.insertId };

  } catch (error) {
    console.error("❌ SQL ERROR:", error.sqlMessage || error.message);
    throw error; 
  }
};