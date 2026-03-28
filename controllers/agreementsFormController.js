// controllers/agreementsFormController.js
const db = require("../db");

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
        signature
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      aadhaar_last4, // Stores only last 4 digits
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




/////////////////////////////////////////////////////////
// ✅ ADMIN: Get All Agreements
/////////////////////////////////////////////////////////
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
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

/////////////////////////////////////////////////////////
// ✅ ADMIN: Get Single Agreement
/////////////////////////////////////////////////////////
exports.getAgreementById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      "SELECT * FROM agreements_form WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Agreement not found"
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    console.error("❌ Error fetching agreement:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ✅ ADMIN: Upload Final Agreement PDF
exports.uploadFinalPDF = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Cloudinary puts the URL in req.file.path
    const filePath = req.file ? req.file.path : null;

    console.log("📥 Upload Request for ID:", id);
    console.log("📄 File Path from Cloudinary:", filePath);

    if (!filePath) {
      return res.status(400).json({ 
        success: false, 
        message: "File upload failed. Cloudinary did not return a URL." 
      });
    }

    // Update the database: Set the PDF link and change status to 'approved'
    const sql = "UPDATE agreements_form SET final_pdf = ?, status = 'approved' WHERE id = ?";
    const [result] = await db.query(sql, [filePath, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Agreement not found in database." 
      });
    }

    console.log("✅ Database updated successfully");

    res.json({
      success: true,
      message: "Agreement approved and PDF uploaded!",
      pdf_url: filePath
    });

  } catch (error) {
    console.error("❌ SERVER ERROR:", error.message);
    res.status(500).json({ 
      success: false, 
      message: "Internal Server Error", 
      error: error.message 
    });
  }
};