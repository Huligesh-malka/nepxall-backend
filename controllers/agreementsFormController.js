const db = require("../db");
// ❌ REMOVED: const axios = require("axios");
// ❌ REMOVED: const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= PRE-OTP VERIFICATION (USING USERS TABLE) ================= */
exports.verifyTenantForBooking = async (req, res) => {
  const { booking_id, mobile } = req.body;
  
  if (!booking_id || !mobile) {
    return res.status(400).json({ success: false, message: "Booking ID and Mobile are required" });
  }

  try {
    const [rows] = await db.query(
      `SELECT u.phone 
       FROM agreements_form af
       JOIN users u ON af.user_id = u.id
       WHERE af.booking_id = ?`,
      [booking_id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "No record found for this booking or user." });
    }

    const registeredPhone = rows[0].phone.replace(/\D/g, '');
    const inputMobile = mobile.replace(/\D/g, '');
    const isMatch = registeredPhone.endsWith(inputMobile) && inputMobile.length >= 10;

    if (isMatch) {
      return res.json({ 
        success: true, 
        message: "Mobile verified against registered account. Proceed with OTP." 
      });
    } else {
      return res.status(403).json({ 
        success: false, 
        message: "Access Denied. This number does not match your registered account phone." 
      });
    }
  } catch (err) {
    console.error("Verification Error:", err);
    res.status(500).json({ success: false, message: "Internal Server Error during verification" });
  }
};

/* ================= TENANT FINAL SIGNING (SIMPLIFIED - NO PDF EDIT) ================= */
exports.tenantFinalSign = async (req, res) => {
  try {
    const { booking_id, tenant_signature, tenant_mobile } = req.body;

    // Capture IP Address (checks for proxy headers first, then remote address)
    const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    
    // Capture Device Info (User Agent)
    const device_info = req.headers['user-agent'] || "Unknown Device";
    
    // Fetch to verify the agreement exists and mobile matches
    const [rows] = await db.query(
      `SELECT af.signed_pdf, u.phone 
       FROM agreements_form af
       JOIN users u ON af.user_id = u.id
       WHERE af.booking_id = ?`, 
      [booking_id]
    );
    
    const data = rows[0];

    if (!data?.signed_pdf) return res.status(400).json({ message: "Owner has not signed yet" });
    
    const dbPhone = data.phone.replace(/\D/g, '');
    const inputMobile = tenant_mobile.replace(/\D/g, '');
    
    if (!dbPhone.endsWith(inputMobile)) {
        return res.status(403).json({ message: "Mobile number mismatch with registered profile." });
    }

    // ✅ Just save signature directly (NO sharp, NO PDF edit)
    await db.query(
      `UPDATE agreements_form 
       SET agreement_status = 'completed', 
           tenant_final_signature = ?, 
           tenant_mobile = ?,
           tenant_ip_address = ?,
           tenant_device_info = ?
       WHERE booking_id = ?`, 
      [tenant_signature, tenant_mobile, ip_address, device_info, booking_id]
    );

    res.json({ success: true, message: "Signature saved successfully" });
  } catch (err) {
    console.error("🔥 Tenant Signing Error:", err);
    res.status(500).json({ success: false, message: "Tenant signing failed" });
  }
};

/* ================= USER: GET STATUS ================= */
exports.getAgreementByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const [rows] = await db.query(
      `SELECT af.*, u.phone as registered_phone 
       FROM agreements_form af
       JOIN users u ON af.user_id = u.id
       WHERE af.booking_id = ?`,
      [bookingId]
    );
    if (rows && rows.length > 0) return res.json({ success: true, exists: true, data: rows[0] });
    return res.json({ success: true, exists: false });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/* ================= USER: SUBMIT FORM ================= */
exports.submitAgreementForm = async (req) => {
  const { user_id, booking_id, full_name, father_name, mobile, email, address, city, state, pincode, aadhaar_last4, pan_number, checkin_date, agreement_months, rent, deposit, maintenance } = req.body;
  const files = req.files || {};
  const toSafeInt = (v) => isNaN(parseInt(v)) ? 0 : parseInt(v);

  const sql = `INSERT INTO agreements_form (user_id, booking_id, full_name, father_name, mobile, email, address, city, state, pincode, aadhaar_last4, pan_number, checkin_date, agreement_months, rent, deposit, maintenance, signature, aadhaar_front, aadhaar_back, pan_card, agreement_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`;
  const values = [toSafeInt(user_id), toSafeInt(booking_id), full_name, father_name, mobile, email, address, city, state, pincode, aadhaar_last4, pan_number, checkin_date, toSafeInt(agreement_months), toSafeInt(rent), toSafeInt(deposit), toSafeInt(maintenance), files["signature"]?.[0]?.path, files["aadhaar_front"]?.[0]?.path, files["aadhaar_back"]?.[0]?.path, files["pan_card"]?.[0]?.path];

  const [result] = await db.query(sql, values);
  return { insertId: result.insertId };
};

/* ================= ADMIN LOGIC ================= */
exports.getAllAgreements = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM agreements_form ORDER BY created_at DESC");
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch agreements" });
  }
};

exports.getAgreementById = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM agreements_form WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching details" });
  }
};

exports.updateAgreementStatus = async (req, res) => {
  try {
    await db.query("UPDATE agreements_form SET agreement_status = ? WHERE id = ?", [req.body.status, req.params.id]);
    res.json({ success: true, message: "Status updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Update failed" });
  }
};

exports.uploadFinalImage = async (req, res) => {
  try {
    const { id } = req.params;
    const final_image_path = req.file?.path;
    if (!final_image_path) return res.status(400).json({ success: false, message: "No file uploaded" });

    await db.query(
      "UPDATE agreements_form SET final_pdf = ?, signed_pdf = NULL, owner_signed_at = NULL, agreement_status = 'approved' WHERE id = ?", 
      [final_image_path, id]
    );
    res.json({ success: true, message: "Document re-uploaded. Workflow reset." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Upload failed" });
  }
};

exports.deleteAgreement = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query("DELETE FROM agreements_form WHERE id = ?", [id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, message: "Agreement deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Delete failed" });
  }
};