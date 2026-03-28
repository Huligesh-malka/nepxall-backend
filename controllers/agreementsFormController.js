const db = require("../db");

/**
 * ✅ USER: Submit Agreement Form
 */
exports.submitAgreementForm = async (req) => {
  try {
    const {
      user_id, booking_id, full_name, father_name, mobile, email,
      address, city, state, pincode, aadhaar_last4, pan_number,
      checkin_date, agreement_months, rent, deposit, maintenance
    } = req.body;

    const files = req.files || {};
    const signature = files['signature']?.[0]?.path ? files['signature'][0].path.replace(/\\/g, '/') : null;

    const toSafeInt = (val) => (val === "undefined" || val === "" || val === null) ? 0 : parseInt(val) || 0;

    const sql = `
      INSERT INTO agreements_form (
        user_id, booking_id, full_name, father_name, mobile, email,
        address, city, state, pincode, aadhaar_last4, pan_number,
        checkin_date, agreement_months, rent, deposit, maintenance,
        signature, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `;

    const values = [
      toSafeInt(user_id), toSafeInt(booking_id), full_name, father_name || null,
      mobile, email || null, address, city || null, state || null, pincode || null,
      aadhaar_last4, pan_number || null, checkin_date, toSafeInt(agreement_months),
      toSafeInt(rent), toSafeInt(deposit), toSafeInt(maintenance), signature
    ];

    const [result] = await db.query(sql, values);
    return { insertId: result.insertId };
  } catch (error) {
    throw error;
  }
};

/**
 * ✅ ADMIN: Update Status & Upload E-Stamp
 */
exports.updateAgreementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; 
    
    // Check if admin uploaded the E-stamp paper
    const estamp_paper = req.file ? req.file.path.replace(/\\/g, '/') : null;

    let sql = "UPDATE agreements_form SET status = ?";
    let params = [status];

    if (estamp_paper) {
      sql += ", estamp_paper = ?";
      params.push(estamp_paper);
    }

    sql += " WHERE id = ?";
    params.push(id);

    const [result] = await db.query(sql, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Agreement not found" });
    }

    res.json({ success: true, message: `Agreement ${status} and updated.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ✅ OWNER: Sign the Agreement
 */
exports.ownerSignAgreement = async (req, res) => {
  try {
    const { id } = req.params;
    const owner_signature = req.file ? req.file.path.replace(/\\/g, '/') : null;

    if (!owner_signature) {
      return res.status(400).json({ success: false, message: "Owner signature file is required" });
    }

    const [result] = await db.query(
      "UPDATE agreements_form SET owner_signature = ?, owner_signed_at = NOW(), status = 'signed' WHERE id = ?",
      [owner_signature, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Agreement not found" });
    }

    res.json({ success: true, message: "Agreement signed by owner successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ✅ FETCHING DATA (Admin/Owner/User)
 */
exports.getAllAgreements = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM agreements_form ORDER BY id DESC");
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAgreementById = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM agreements_form WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};