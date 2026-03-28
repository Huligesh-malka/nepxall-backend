const db = require("../db");

/**
 * ✅ USER: Submit Agreement Form
 */
exports.submitAgreementForm = async (req) => {
  console.log("📥 --- Processing Simplified Agreement ---");

  try {
    const {
      user_id, booking_id, full_name, father_name, mobile, email,
      address, city, state, pincode, aadhaar_last4, pan_number,
      checkin_date, agreement_months, rent, deposit, maintenance
    } = req.body;

    const files = req.files || {};
    // Normalize path: Replace backslashes with forward slashes for cross-platform compatibility
    const signature = files['signature']?.[0]?.path ? files['signature'][0].path.replace(/\\/g, '/') : null;

    const toSafeInt = (val) => {
      if (val === "undefined" || val === "" || val === null) return 0;
      return parseInt(val) || 0;
    };

    const sql = `
      INSERT INTO agreements_form (
        user_id, booking_id, full_name, father_name, mobile, email,
        address, city, state, pincode, aadhaar_last4, pan_number,
        checkin_date, agreement_months, rent, deposit, maintenance,
        signature, status
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
    console.error("❌ DB Error during submission:", error.message);
    throw error;
  }
};

/**
 * ✅ ADMIN: Get All Agreements
 */
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
    console.error("❌ Error fetching all agreements:", error.message);
    res.status(500).json({ success: false, message: "Database error" });
  }
};

/**
 * ✅ ADMIN: Get Single Agreement by ID
 */
exports.getAgreementById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      "SELECT * FROM agreements_form WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Agreement not found" });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("❌ Error fetching single agreement:", error.message);
    res.status(500).json({ success: false, message: "Database error" });
  }
};

/**
 * ✅ ADMIN: Update Agreement Status
 */
exports.updateAgreementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // e.g., 'approved', 'rejected'

    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required" });
    }

    const [result] = await db.query(
      "UPDATE agreements_form SET status = ? WHERE id = ?",
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Agreement not found" });
    }

    res.json({ success: true, message: `Agreement marked as ${status}` });
  } catch (error) {
    console.error("❌ Error updating agreement status:", error.message);
    res.status(500).json({ success: false, message: "Database error" });
  }
};