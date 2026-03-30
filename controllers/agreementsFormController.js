const db = require("../db");

/* ================= USER: GET AGREEMENT ================= */
exports.getAgreementByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const [rows] = await db.query(
      "SELECT agreement_status, final_pdf FROM agreements_form WHERE booking_id = ?", 
      [bookingId]
    );

    if (rows.length > 0) {
      return res.json({ 
        success: true, 
        exists: true, 
        data: rows[0]
      });
    }

    res.json({ success: true, exists: false });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};


/* ================= USER: SUBMIT FORM ================= */
exports.submitAgreementForm = async (req) => {
  try {
    const {
      user_id, booking_id, full_name, father_name, mobile, email,
      address, city, state, pincode, aadhaar_last4, pan_number,
      checkin_date, agreement_months, rent, deposit, maintenance,
      signature // ✅ now coming from frontend (base64/url)
    } = req.body;

    const files = req.files || {};

    const aadhaar_front = files["aadhaar_front"]?.[0]?.path || null;
    const aadhaar_back = files["aadhaar_back"]?.[0]?.path || null;
    const pan_card = files["pan_card"]?.[0]?.path || null;

    const toSafeInt = (val) => {
      if (!val || isNaN(val)) return 0;
      return parseInt(val);
    };

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
      signature, // ✅ stored directly
      aadhaar_front,
      aadhaar_back,
      pan_card
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
    const [rows] = await db.query("SELECT * FROM agreements_form ORDER BY id DESC");
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};


/* ================= ADMIN: GET SINGLE ================= */
exports.getAgreementById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      "SELECT * FROM agreements_form WHERE id = ?", 
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false });
    }

    res.json({ success: true, data: rows[0] });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};


/* ================= ADMIN: UPDATE STATUS ================= */
exports.updateAgreementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await db.query(
      "UPDATE agreements_form SET agreement_status = ? WHERE id = ?", 
      [status, id]
    );

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};


/* ================= ADMIN: UPLOAD FINAL PDF ================= */
exports.uploadFinalImage = async (req, res) => {
  try {
    const { id } = req.params;
    const imageUrl = req.file ? req.file.path : null;

    if (!imageUrl) {
      return res.status(400).json({ success: false });
    }

    await db.query(
      "UPDATE agreements_form SET final_pdf=?, agreement_status='approved' WHERE id=?",
      [imageUrl, id]
    );

    res.json({ success: true, imageUrl });

  } catch (error) {
    res.status(500).json({ success: false });
  }
};