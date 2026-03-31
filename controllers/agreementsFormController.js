const db = require("../db");
const axios = require("axios");
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= PRE-OTP VERIFICATION (FOR TENANT) ================= */
// This ensures that ONLY the mobile number registered during form submission can get the OTP
exports.verifyTenantForBooking = async (req, res) => {
  const { booking_id, mobile } = req.body;
  
  if (!booking_id || !mobile) {
    return res.status(400).json({ success: false, message: "Booking ID and Mobile are required" });
  }

  try {
    // Fetch the registered mobile for this specific booking
    const [rows] = await db.query(
      "SELECT mobile FROM agreements_form WHERE booking_id = ?",
      [booking_id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "No agreement record found for this booking." });
    }

    // Clean both numbers (remove +91, spaces, dashes) to compare purely digits
    const registeredMobile = rows[0].mobile.replace(/\D/g, '');
    const inputMobile = mobile.replace(/\D/g, '');

    // Strict validation: The input must match the last 10 digits of the registered number
    const isMatch = registeredMobile.endsWith(inputMobile) && inputMobile.length >= 10;

    if (isMatch) {
      return res.json({ 
        success: true, 
        message: "Mobile verified. You may proceed with OTP." 
      });
    } else {
      return res.status(403).json({ 
        success: false, 
        message: "Access Denied. This mobile number is not registered for this agreement." 
      });
    }
  } catch (err) {
    console.error("Verification Error:", err);
    res.status(500).json({ success: false, message: "Internal Server Error during verification" });
  }
};

/* ================= USER: GET STATUS ================= */
exports.getAgreementByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const [rows] = await db.query(
      "SELECT agreement_status, final_pdf, signed_pdf, full_name, mobile, email FROM agreements_form WHERE booking_id = ?",
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

/* ================= TENANT FINAL SIGNING ================= */
exports.tenantFinalSign = async (req, res) => {
  try {
    const { booking_id, tenant_signature, tenant_mobile } = req.body;
    
    const [rows] = await db.query(
      `SELECT signed_pdf, city, state, mobile FROM agreements_form WHERE booking_id = ?`, 
      [booking_id]
    );
    const data = rows[0];

    if (!data?.signed_pdf) return res.status(400).json({ message: "Owner has not signed yet" });
    
    const dbMobile = data.mobile.replace(/\D/g, '');
    const inputMobile = tenant_mobile.replace(/\D/g, '');
    
    if (!dbMobile.endsWith(inputMobile)) {
        return res.status(403).json({ message: "Mobile number verification failed. Use your registered number." });
    }

    const response = await axios.get(data.signed_pdf, { responseType: "arraybuffer" });
    const baseImage = Buffer.from(response.data);
    const metadata = await sharp(baseImage).metadata();
    
    const sigBuffer = Buffer.from(tenant_signature.split(",")[1], "base64");
    const resizedSig = await sharp(sigBuffer).resize(180, 70).png().toBuffer();

    const now = new Date();
    const istDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short" }).format(now);
    const istTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", timeStyle: "medium" }).format(now);

    const svgText = `
    <svg width="350" height="160">
      <text x="0" y="18" font-family="Arial" font-size="13" fill="black" font-weight="bold">Digitally Signed by Tenant</text>
      <text x="0" y="38" font-family="Arial" font-size="11" fill="#444">Mobile: ${tenant_mobile}</text>
      <text x="0" y="55" font-family="Arial" font-size="11" fill="#444">Location: ${data.city || ""}, ${data.state || ""}</text>
      <text x="0" y="72" font-family="Arial" font-size="11" fill="#444">Date: ${istDate} ${istTime}</text>
    </svg>`;

    const finalImageBuffer = await sharp(baseImage)
      .composite([
        { input: Buffer.from(svgText), top: metadata.height - 340, left: 80 },
        { input: resizedSig, top: metadata.height - 270, left: 80 }
      ]).png().toBuffer();

    const upload = await cloudinary.uploader.upload(
      `data:image/png;base64,${finalImageBuffer.toString("base64")}`, 
      { folder: "signed_agreements" }
    );

    await db.query(
      `UPDATE agreements_form 
       SET signed_pdf = ?, 
           agreement_status = 'completed', 
           tenant_final_signature = ?, 
           tenant_mobile = ? 
       WHERE booking_id = ?`, 
      [upload.secure_url, tenant_signature, tenant_mobile, booking_id]
    );

    res.json({ success: true, url: upload.secure_url });
  } catch (err) {
    console.error("🔥 Tenant Signing Error:", err);
    res.status(500).json({ success: false, message: "Tenant signing failed" });
  }
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