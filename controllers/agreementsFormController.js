const db = require("../db");
const cloudinary = require("../utils/cloudinary");

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
      maintenance
    } = req.body;

    const final_booking_id =
      booking_id && booking_id !== "undefined"
        ? parseInt(booking_id)
        : null;

    /* ================= CLOUDINARY UPLOAD ================= */

    const uploadFile = async (file) => {
      if (!file) return null;

      const result = await cloudinary.uploader.upload(file.path, {
        folder: "agreements",
        resource_type: "auto"
      });

      return result.secure_url;
    };

    const aadhaar_front_file = req.files?.aadhaar_front?.[0];
    const aadhaar_back_file = req.files?.aadhaar_back?.[0];
    const pan_card_file = req.files?.pan_card?.[0];
    const signature_file = req.files?.signature?.[0];

    /* ================= PARALLEL UPLOAD (FASTER) ================= */

    const [
      aadhaar_front,
      aadhaar_back,
      pan_card,
      signature
    ] = await Promise.all([
      uploadFile(aadhaar_front_file),
      uploadFile(aadhaar_back_file),
      uploadFile(pan_card_file),
      uploadFile(signature_file)
    ]);

    /* ================= DATABASE INSERT ================= */

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
      aadhaar_front,
      aadhaar_back,
      pan_number || null,
      pan_card,
      checkin_date || null,
      agreement_months || null,
      rent || null,
      deposit || null,
      maintenance || null,
      signature
    ];

    db.query(sql, values, (err, result) => {

      if (err) {

        console.error("❌ SQL ERROR:", err.sqlMessage || err);

        return res.status(500).json({
          success: false,
          message: "Database error",
          details: err.sqlMessage
        });

      }

      res.status(200).json({
        success: true,
        message: "Agreement submitted successfully",
        agreement_id: result.insertId
      });

    });

  } catch (error) {

    console.error("❌ CRITICAL ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Server crash prevented."
    });

  }

};