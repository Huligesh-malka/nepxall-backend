const db = require("../db");

exports.submitAgreementForm = (req, res) => {
  try {
    const {
      user_id, booking_id, full_name, father_name, dob, mobile, email,
      occupation, company_name, address, city, state, pincode,
      aadhaar_number, aadhaar_last4, pan_number, checkin_date,
      agreement_months, rent, deposit, maintenance
    } = req.body;

    // Extract Cloudinary/File paths safely
    const aadhaar_front = req.files?.aadhaar_front?.[0]?.path || null;
    const aadhaar_back = req.files?.aadhaar_back?.[0]?.path || null;
    const pan_card = req.files?.pan_card?.[0]?.path || null;
    const signature = req.files?.signature?.[0]?.path || null;

    const sql = `
      INSERT INTO agreements_form (
        user_id, booking_id, full_name, father_name, dob, mobile, email,
        occupation, company_name, address, city, state, pincode,
        aadhaar_number, aadhaar_last4, aadhaar_front, aadhaar_back,
        pan_number, pan_card, checkin_date, agreement_months,
        rent, deposit, maintenance, signature
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    // Crucial: Ensure the order matches the SQL statement above
    const values = [
      user_id || null, booking_id || null, full_name || null, father_name || null,
      dob || null, mobile || null, email || null, occupation || null,
      company_name || null, address || null, city || null, state || null,
      pincode || null, aadhaar_number || null, aadhaar_last4 || null,
      aadhaar_front, aadhaar_back, pan_number || null, pan_card,
      checkin_date || null, agreement_months || null, rent || null,
      deposit || null, maintenance || null, signature
    ];

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error("❌ Database Error:", err);
        return res.status(500).json({ success: false, message: "Database insertion failed" });
      }
      res.status(200).json({
        success: true,
        message: "Agreement submitted successfully",
        agreement_id: result.insertId
      });
    });

  } catch (error) {
    console.error("❌ Controller Error:", error);
    res.status(500).json({ success: false, message: "Server error during submission" });
  }
};