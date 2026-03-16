const db = require("../db");

/* ======================================================
   SUBMIT AGREEMENT FORM
====================================================== */

exports.submitAgreementForm = async (req, res) => {

  console.log("📥 --- New Agreement Submission ---");

  try {

    const {
      user_id,
      booking_id,
      full_name,
      father_name,
      dob,
      mobile,
      email,
      occupation,
      company_name,
      address,
      city,
      state,
      pincode,
      aadhaar_number,
      aadhaar_last4,
      pan_number,
      checkin_date,
      agreement_months,
      rent,
      deposit,
      maintenance,
      aadhaar_front,
      aadhaar_back,
      pan_card,
      signature
    } = req.body;

    if (!full_name || !mobile) {
      return res.status(400).json({
        success: false,
        message: "Full name and mobile required"
      });
    }

    const final_booking_id =
      booking_id && booking_id !== "undefined"
        ? parseInt(booking_id)
        : null;

    console.log("📄 Received document URLs:", {
      aadhaar_front,
      aadhaar_back,
      pan_card,
      signature
    });

    const sql = `
      INSERT INTO agreements_form (
        user_id,
        booking_id,
        full_name,
        father_name,
        dob,
        mobile,
        email,
        occupation,
        company_name,
        address,
        city,
        state,
        pincode,
        aadhaar_number,
        aadhaar_last4,
        aadhaar_front,
        aadhaar_back,
        pan_number,
        pan_card,
        checkin_date,
        agreement_months,
        rent,
        deposit,
        maintenance,
        signature
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    const values = [
      user_id || null,
      final_booking_id,
      full_name || null,
      father_name || null,
      dob || null,
      mobile || null,
      email || null,
      occupation || null,
      company_name || null,
      address || null,
      city || null,
      state || null,
      pincode || null,
      aadhaar_number || null,
      aadhaar_last4 || null,
      aadhaar_front || null,
      aadhaar_back || null,
      pan_number || null,
      pan_card || null,
      checkin_date || null,
      agreement_months || null,
      rent || null,
      deposit || null,
      maintenance || null,
      signature || null
    ];

    db.query(sql, values, (err, result) => {

      if (err) {

        console.error("❌ SQL ERROR:", err);

        return res.status(500).json({
          success: false,
          message: "Database error",
          error: err.sqlMessage
        });

      }

      console.log("✅ Agreement saved with ID:", result.insertId);

      return res.status(200).json({
        success: true,
        message: "Agreement submitted successfully",
        agreement_id: result.insertId
      });

    });

  } catch (error) {

    console.error("❌ CRITICAL ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });

  }

};