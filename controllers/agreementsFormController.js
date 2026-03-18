const db = require("../db"); // This is your new promise-based pool

exports.submitAgreementForm = async (req) => {
  console.log("📥 --- Processing Agreement Submission ---");

  try {
    const { full_name, mobile, email, pan_number, booking_id, user_id } = req.body;
    const files = req.files || {};

    const toSafeInt = (val) => {
      if (val === "undefined" || val === "" || !val) return null;
      const parsed = parseInt(val);
      return isNaN(parsed) ? null : parsed;
    };

    const aadhaar_front = files['aadhaar_front']?.[0]?.path || null;
    const pan_card = files['pan_card']?.[0]?.path || null;
    const signature = files['signature']?.[0]?.path || null;

    const sql = `
      INSERT INTO agreements_form (
        user_id, booking_id, full_name, mobile, email, pan_number, 
        aadhaar_front, pan_card, signature, agreement_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      toSafeInt(user_id),
      toSafeInt(booking_id),
      full_name || null,
      mobile || null,
      email || null,
      pan_number || null,
      aadhaar_front,
      pan_card,
      signature,
      'form_submitted'
    ];

    // ✅ With your new db.js, you use await directly on db.query
    const [result] = await db.query(sql, values);
    
    console.log("✅ DB Insert Success ID:", result.insertId);
    return { insertId: result.insertId };

  } catch (error) {
    console.error("❌ Controller Error:", error.message);
    throw error; 
  }
};