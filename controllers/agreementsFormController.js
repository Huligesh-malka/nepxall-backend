const db = require("../db");

exports.submitAgreementForm = async (req) => {
  console.log("📥 --- Processing Agreement Submission ---");

  try {
    const body = req.body;
    const files = req.files || {};

    // Map Cloudinary URLs from Multer-Cloudinary storage
    const aadhaar_front = files['aadhaar_front'] ? files['aadhaar_front'][0].path : null;
    const pan_card = files['pan_card'] ? files['pan_card'][0].path : null;
    const signature = files['signature'] ? files['signature'][0].path : null;
    // Handle optional aadhaar_back if you add it later
    const aadhaar_back = files['aadhaar_back'] ? files['aadhaar_back'][0].path : null;

    if (!body.full_name || !body.mobile) {
      throw new Error("Full name and mobile are required");
    }

    // SQL matched exactly to your table description
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
      body.user_id || null,
      body.booking_id || null,
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
      aadhaar_back,
      body.pan_number || null,
      pan_card,
      body.checkin_date || null,
      body.agreement_months || null,
      body.rent || null,
      body.deposit || null,
      body.maintenance || null,
      signature,
      'form_submitted'
    ];

    const result = await new Promise((resolve, reject) => {
      db.query(sql, values, (err, res) => {
        if (err) {
          console.error("❌ SQL Execution Error:", err.message);
          return reject(err);
        }
        resolve(res);
      });
    });

    console.log("✅ Database record created:", result.insertId);
    return { success: true, agreement_id: result.insertId };

  } catch (error) {
    console.error("❌ Controller Error:", error.message);
    throw error; 
  }
};