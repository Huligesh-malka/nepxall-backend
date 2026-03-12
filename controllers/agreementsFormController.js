const db = require("../db");

exports.submitAgreementForm = (req, res) => {
  // 1. Initial log to track the start of the request
  console.log(`--- Agreement Submission Started for Booking: ${req.body.booking_id} ---`);
  
  try {
    const {
      user_id, booking_id, full_name, mobile, email, pan_number, 
      father_name, dob, occupation, company_name, address, city, 
      state, pincode, aadhaar_number, aadhaar_last4, 
      checkin_date, agreement_months, rent, deposit, maintenance
    } = req.body;

    // 2. Immediate validation to prevent DB crashes
    const final_booking_id = (booking_id && booking_id !== 'undefined') 
      ? parseInt(booking_id) 
      : null;

    // 3. Extract Cloudinary paths safely (Multer has already uploaded these)
    const aadhaar_front = req.files?.aadhaar_front?.[0]?.path || null;
    const aadhaar_back = req.files?.aadhaar_back?.[0]?.path || null;
    const pan_card = req.files?.pan_card?.[0]?.path || null;
    const signature = req.files?.signature?.[0]?.path || null;

    const sql = `
      INSERT INTO agreements_form (
        user_id, booking_id, full_name, mobile, email, pan_number,
        father_name, dob, occupation, company_name, address, city, 
        state, pincode, aadhaar_number, aadhaar_last4,
        aadhaar_front, aadhaar_back, pan_card, signature,
        checkin_date, agreement_months, rent, deposit, maintenance
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    const values = [
      user_id || null, final_booking_id, full_name || null, mobile || null, email || null, pan_number || null,
      father_name || null, dob || null, occupation || null, company_name || null, address || null, city || null,
      state || null, pincode || null, aadhaar_number || null, aadhaar_last4 || null,
      aadhaar_front, aadhaar_back, pan_card, signature,
      checkin_date || null, agreement_months || null, rent || null, deposit || null, maintenance || null
    ];

    // 4. Execute DB query
    db.query(sql, values, (err, result) => {
      if (err) {
        console.error("❌ SQL ERROR:", err.sqlMessage || err);
        return res.status(500).json({ 
          success: false, 
          message: "Database save failed.", 
          details: err.sqlMessage 
        });
      }
      
      console.log(`✅ Submission successful for ID: ${result.insertId}`);
      return res.status(200).json({
        success: true,
        message: "Agreement submitted successfully",
        agreement_id: result.insertId
      });
    });

  } catch (error) {
    console.error("❌ SERVER ERROR:", error);
    res.status(500).json({ success: false, message: "Internal server error during upload." });
  }
};