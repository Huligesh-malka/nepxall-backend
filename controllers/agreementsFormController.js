const db = require("../db");
const axios = require("axios");
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

/* ================= OWNER SIGNING ================= */
exports.signOwnerAgreement = async (req, res) => {
  try {
    const { booking_id, owner_signature, accepted_terms } = req.body;
    const [rows] = await db.query("SELECT final_pdf, city, state FROM agreements_form WHERE booking_id = ?", [booking_id]);
    if (!rows[0]?.final_pdf) return res.status(404).json({ message: "Draft not found" });

    const response = await axios.get(rows[0].final_pdf, { responseType: "arraybuffer" });
    const baseImage = Buffer.from(response.data);
    const metadata = await sharp(baseImage).metadata();
    const sigBuffer = Buffer.from(owner_signature.split(",")[1], "base64");
    const resizedSig = await sharp(sigBuffer).resize(220, 90).png().toBuffer();

    const now = new Date();
    const istDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short" }).format(now);
    const istTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", timeStyle: "medium" }).format(now);

    const svgText = `<svg width="600" height="200"><text x="0" y="20" font-family="Arial" font-size="16">Digitally Signed by Owner</text><text x="0" y="45" font-family="Arial" font-size="14">Date: ${istDate}</text><text x="0" y="70" font-family="Arial" font-size="14">Time: ${istTime}</text></svg>`;

    const finalImage = await sharp(baseImage)
      .composite([
        { input: Buffer.from(svgText), top: metadata.height - 240, left: metadata.width - 320 },
        { input: resizedSig, top: metadata.height - 180, left: metadata.width - 320 }
      ]).png().toBuffer();

    const upload = await cloudinary.uploader.upload(`data:image/png;base64,${finalImage.toString("base64")}`, { folder: "signed_agreements" });

    await db.query(`UPDATE agreements_form SET signed_pdf = ?, agreement_status = 'approved', owner_signed_at = NOW() WHERE booking_id = ?`, [upload.secure_url, booking_id]);
    res.json({ success: true, signed_pdf: upload.secure_url });
  } catch (err) {
    res.status(500).json({ message: "Owner signing failed" });
  }
};

/* ================= TENANT SIGNING ================= */
exports.tenantFinalSign = async (req, res) => {
  try {
    const { booking_id, tenant_signature, tenant_mobile } = req.body;
    
    // 1. Fetch record including location data
    const [rows] = await db.query(
      `SELECT signed_pdf, city, state FROM agreements_form WHERE booking_id = ?`, 
      [booking_id]
    );
    const data = rows[0];

    if (!data?.signed_pdf) return res.status(400).json({ message: "Owner has not signed yet" });

    // 2. Process Image
    const response = await axios.get(data.signed_pdf, { responseType: "arraybuffer" });
    const baseImage = Buffer.from(response.data);
    const metadata = await sharp(baseImage).metadata();
    
    const sigBuffer = Buffer.from(tenant_signature.split(",")[1], "base64");
    const resizedSig = await sharp(sigBuffer).resize(180, 70).png().toBuffer();

    const now = new Date();
    const istDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short" }).format(now);
    const istTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", timeStyle: "medium" }).format(now);

    // 3. SVG with Location line added (y=55)
    const svgText = `
    <svg width="350" height="160">
      <text x="0" y="18" font-family="Arial" font-size="13" fill="black">Digitally Signed by Tenant</text>
      <text x="0" y="38" font-family="Arial" font-size="11" fill="#444">Mobile: ${tenant_mobile}</text>
      <text x="0" y="55" font-family="Arial" font-size="11" fill="#444">Location: ${data.city || ""}, ${data.state || ""}</text>
      <text x="0" y="72" font-family="Arial" font-size="11" fill="#444">Date: ${istDate} ${istTime}</text>
    </svg>`;

    // 4. Composite
    const finalImageBuffer = await sharp(baseImage)
      .composite([
        { input: Buffer.from(svgText), top: metadata.height - 340, left: 80 },
        { input: resizedSig, top: metadata.height - 270, left: 80 }
      ]).png().toBuffer();

    const upload = await cloudinary.uploader.upload(
      `data:image/png;base64,${finalImageBuffer.toString("base64")}`, 
      { folder: "signed_agreements" }
    );

    // 5. Update Database
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

    // CRITICAL: Clear signed_pdf and owner_signed_at when Admin re-uploads.
    // This forces the workflow back to the beginning for the NEW version.
    await db.query(
      "UPDATE agreements_form SET final_pdf = ?, signed_pdf = NULL, owner_signed_at = NULL, agreement_status = 'approved' WHERE id = ?", 
      [final_image_path, id]
    );
    res.json({ success: true, message: "Document re-uploaded. All previous signatures cleared for the new version." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Upload failed" });
  }
};

exports.deleteAgreement = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query("DELETE FROM agreements_form WHERE id = ?", [id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, message: "Agreement deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Delete failed" });
  }
};