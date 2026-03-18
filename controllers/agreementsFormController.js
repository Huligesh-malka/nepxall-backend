const db = require("../db");

exports.submitAgreementForm = async (req) => {
  console.log("📥 --- Processing Agreement Submission ---");

  try {
    const { booking_id, full_name, mobile, email, pan_number } = req.body;

    // Extract Cloudinary URLs from req.files (populated by uploadAgreement middleware)
    const aadhaar_front = req.files['aadhaar_front'] ? req.files['aadhaar_front'][0].path : null;
    const pan_card = req.files['pan_card'] ? req.files['pan_card'][0].path : null;
    const signature = req.files['signature'] ? req.files['signature'][0].path : null;

    if (!full_name || !mobile) {
      throw new Error("Full name and mobile required");
    }

    const sql = `
      INSERT INTO agreements_form (
        booking_id, full_name, mobile, email, pan_number,
        aadhaar_front, pan_card, signature
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      booking_id || null,
      full_name,
      mobile,
      email || null,
      pan_number || null,
      aadhaar_front,
      pan_card,
      signature
    ];

    const result = await new Promise((resolve, reject) => {
      db.query(sql, values, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });

    return { agreement_id: result.insertId };
  } catch (error) {
    console.error("❌ Controller Error:", error);
    throw error;
  }
};