const db = require("../db");

/* ================= USER: SUBMIT FORM ================= */
exports.submitAgreementForm = async (req) => {
  console.log("📥 --- Processing Simplified Agreement ---");

  try {
    const {
      user_id, booking_id, full_name, father_name, mobile, email,
      address, city, state, pincode, aadhaar_last4, pan_number,
      checkin_date, agreement_months, rent, deposit, maintenance
    } = req.body;

    const files = req.files || {};
    const signature = files['signature']?.[0]?.path || null;

    const toSafeInt = (val) => {
      if (val === "undefined" || val === "" || val === null) return 0;
      return parseInt(val) || 0;
    };

    const sql = `
      INSERT INTO agreements_form (
        user_id, booking_id, full_name, father_name, mobile, email,
        address, city, state, pincode, aadhaar_last4, pan_number,
        checkin_date, agreement_months, rent, deposit, maintenance,
        signature, agreement_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `;

    const values = [
      toSafeInt(user_id),
      toSafeInt(booking_id),
      full_name,
      father_name || null,
      mobile,
      email || null,
      address,
      city || null,
      state || null,
      pincode || null,
      aadhaar_last4,
      pan_number || null,
      checkin_date,
      toSafeInt(agreement_months),
      toSafeInt(rent),
      toSafeInt(deposit),
      toSafeInt(maintenance),
      signature
    ];

    const [result] = await db.query(sql, values);
    return { insertId: result.insertId };

  } catch (error) {
    console.error("❌ DB Error:", error.message);
    throw error;
  }
};

/* ================= ADMIN: GET ALL ================= */
exports.getAllAgreements = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM agreements_form ORDER BY id DESC"
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("❌ Error fetching agreements:", error.message);
    res.status(500).json({ success: false, message: "Server error fetching list" });
  }
};

/* ================= ADMIN: GET SINGLE ================= */
exports.getAgreementById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query("SELECT * FROM agreements_form WHERE id = ?", [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Agreement not found" });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("❌ Error fetching agreement:", error.message);
    res.status(500).json({ success: false, message: "Server error fetching details" });
  }
};

/* ================= ADMIN: UPDATE STATUS ================= */
exports.updateAgreementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // Expecting 'approved' or 'rejected'

    const sql = "UPDATE agreements_form SET agreement_status = ? WHERE id = ?";
    const [result] = await db.query(sql, [status, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Agreement not found" });
    }

    res.json({ success: true, message: `Agreement ${status} successfully` });
  } catch (error) {
    console.error("❌ Status Update Error:", error.message);
    res.status(500).json({ success: false, message: "Server error updating status" });
  }
};
// controllers/agreementsFormController.js

exports.uploadFinalImage = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if file exists (Cloudinary or Multer storage)
    // Cloudinary usually stores the URL in req.file.path
    const imageUrl = req.file ? req.file.path : null;

    if (!imageUrl) {
      return res.status(400).json({ 
        success: false, 
        message: "No image file uploaded. Please upload a JPG, PNG, or WebP." 
      });
    }

    // We update the 'final_pdf' column (or you can rename it to final_image in DB)
    // and automatically set status to 'approved'
    const sql = "UPDATE agreements_form SET final_pdf = ?, agreement_status = 'approved' WHERE id = ?";
    
    const [result] = await db.query(sql, [imageUrl, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Agreement record not found" });
    }

    res.json({
      success: true,
      message: "Agreement image uploaded and status updated to approved!",
      imageUrl: imageUrl // Send back for frontend display
    });

  } catch (error) {
    console.error("❌ Image Upload Error:", error.message);
    res.status(500).json({ 
      success: false, 
      message: "Server error during image upload" 
    });
  }
};