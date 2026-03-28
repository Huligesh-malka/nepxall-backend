const db = require("../db");

/* ================= USER: SUBMIT FORM ================= */
exports.submitAgreementForm = async (req) => {
  console.log("📥 --- Processing Agreement Submission ---");

  try {
    const {
      user_id,
      booking_id,
      full_name,
      father_name,
      mobile,
      email,
      address,
      city,
      state,
      pincode,
      aadhaar_last4,
      pan_number,
      checkin_date,
      agreement_months,
      rent,
      deposit,
      maintenance,
    } = req.body;

    // 1. Extract file paths from Multer (Signature is mandatory)
    const files = req.files || {};
    const signature = files["signature"]?.[0]?.path || null;
    
    // Optional files (if not provided by frontend, they will be null)
    const aadhaar_front = files["aadhaar_front"]?.[0]?.path || null;
    const aadhaar_back = files["aadhaar_back"]?.[0]?.path || null;
    const pan_card = files["pan_card"]?.[0]?.path || null;

    // 2. Helper to prevent "undefined" or NaN in integer columns
    const toSafeInt = (val) => {
      if (val === "undefined" || val === "" || val === null || isNaN(val)) return 0;
      return parseInt(val) || 0;
    };

    // 3. SQL Query (Matches your full table structure)
    const sql = `
      INSERT INTO agreements_form (
        user_id, booking_id, full_name, father_name, mobile, email,
        address, city, state, pincode, aadhaar_last4, pan_number,
        checkin_date, agreement_months, rent, deposit, maintenance,
        signature, aadhaar_front, aadhaar_back, pan_card, agreement_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
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
      signature,       // Path to signature image
      aadhaar_front,   // Path or null
      aadhaar_back,    // Path or null
      pan_card         // Path or null
    ];

    const [result] = await db.query(sql, values);
    
    return { success: true, insertId: result.insertId };

  } catch (error) {
    console.error("❌ DB Error during submission:", error.message);
    throw error;
  }
};

/* ================= ADMIN: GET ALL ================= */
exports.getAllAgreements = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM agreements_form ORDER BY id DESC");
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Fetch All Error:", error.message);
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
    console.error("Fetch One Error:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ================= ADMIN: UPDATE STATUS ================= */
exports.updateAgreementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await db.query("UPDATE agreements_form SET agreement_status = ? WHERE id = ?", [status, id]);
    res.json({ success: true, message: `Status updated to ${status}` });
  } catch (error) {
    console.error("Update Status Error:", error.message);
    res.status(500).json({ success: false, message: "Update failed" });
  }
};

/* ================= ADMIN: UPLOAD FINAL PDF/IMAGE ================= */
exports.uploadFinalImage = async (req, res) => {
  try {
    const { id } = req.params;
    const imageUrl = req.file ? req.file.path : null;

    if (!imageUrl) {
      return res.status(400).json({ success: false, message: "No image/file uploaded" });
    }

    const sql = "UPDATE agreements_form SET final_pdf = ?, agreement_status = 'approved' WHERE id = ?";
    const [result] = await db.query(sql, [imageUrl, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    res.json({ success: true, message: "Approved and uploaded successfully!", imageUrl });
  } catch (error) {
    console.error("Final Upload Error:", error.message);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
};





/* ================= USER: GET AGREEMENT BY BOOKING ID ================= */
exports.getAgreementByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const [rows] = await db.query(
      "SELECT agreement_status, final_pdf FROM agreements_form WHERE booking_id = ?", 
      [bookingId]
    );

    if (rows.length > 0) {
      return res.json({ success: true, exists: true, data: rows[0] });
    }
    
    res.json({ success: true, exists: false });
  } catch (error) {
    console.error("❌ Error checking agreement:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};