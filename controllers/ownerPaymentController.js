const db = require("../db");
const axios = require("axios");
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;

/* ================= CLOUDINARY CONFIG ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= PRE-OTP VERIFICATION ================= */
exports.verifyOwnerForBooking = async (req, res) => {
  const { booking_id, mobile } = req.body;
  try {
    const [rows] = await db.query(`
      SELECT u.phone FROM bookings b
      JOIN users u ON b.owner_id = u.id
      WHERE b.id = ?
    `, [booking_id]);

    if (!rows.length) return res.status(404).json({ success: false, message: "Booking not found" });

    const dbPhone = rows[0].phone.replace(/\D/g, '');
    const inputPhone = mobile.replace(/\D/g, '');

    if (dbPhone.endsWith(inputPhone) || inputPhone.endsWith(dbPhone)) {
      return res.json({ success: true, message: "Owner verified. Proceeding to OTP." });
    } else {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ================= TENANT SIDE: SUBMIT FORM ================= */
exports.submitTenantAgreement = async (req, res) => {
  const { booking_id, full_name, tenant_mobile, location_str } = req.body;
  
  const tenantIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "Unknown";
  const tenantDevice = req.headers["user-agent"] || "Unknown Device";

  try {
    await db.query(`
      UPDATE agreements_form 
      SET full_name = ?, 
          tenant_mobile = ?, 
          tenant_ip_address = ?, 
          tenant_device_info = ?, 
          tenant_location = ?,
          agreement_status = 'pending_owner'
      WHERE booking_id = ?
    `, [full_name, tenant_mobile, tenantIp.split(",")[0], tenantDevice, location_str || "Not Provided", booking_id]);

    res.json({ success: true, message: "Tenant details saved." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Update failed" });
  }
};

/* ================= OWNER SIDE: SIGN AGREEMENT ================= */
exports.signOwnerAgreement = async (req, res) => {
  const { booking_id, owner_mobile, owner_signature, accepted_terms, location_str } = req.body;

  try {
    if (!accepted_terms || !owner_signature || !booking_id || !owner_mobile) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const [verification] = await db.query(`
      SELECT af.signed_pdf, af.final_pdf, u.phone 
      FROM agreements_form af
      JOIN bookings b ON af.booking_id = b.id
      JOIN users u ON b.owner_id = u.id
      WHERE af.booking_id = ?
    `, [booking_id]);

    if (!verification.length) return res.status(404).json({ success: false, message: "Agreement not found" });

    // 1. Capture metadata
    const ownerIp = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0").split(",")[0];
    const ownerDevice = req.headers["user-agent"] || "Unknown Device";
    
    // Formatting date/time as per your screenshot (12-hour format with AM/PM)
    const formattedDate = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true
    }).format(new Date()).toLowerCase();

    // 2. Image Processing
    const response = await axios.get(verification[0].final_pdf, { responseType: "arraybuffer" });
    const baseImage = Buffer.from(response.data);
    const signatureBuffer = Buffer.from(owner_signature.split(",")[1], "base64");
    
    // Resize signature to look natural
    const resizedSignature = await sharp(signatureBuffer).resize(220, 80).png().toBuffer();
    const metadata = await sharp(baseImage).metadata();
    
    // Position: Bottom Right (adjust based on your template)
    const xPos = metadata.width - 400;
    const yPos = metadata.height - 250;

    // 3. Create SVG Overlay with all details requested
    // This creates the text block seen in your screenshot
    const svgOverlay = `
    <svg width="400" height="150">
      <style>
        .label { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; fill: #000; }
        .data { font-family: Arial, sans-serif; font-size: 12px; fill: #333; }
      </style>
      <text x="0" y="20" class="label">Digitally Signed by Owner</text>
      <text x="0" y="42" class="data">Mobile: ${owner_mobile}</text>
      <text x="0" y="62" class="data">Date: ${formattedDate}</text>
      <text x="0" y="82" class="data">IP: ${ownerIp}</text>
      <text x="0" y="102" class="data">Loc: ${location_str || "N/A"}</text>
    </svg>`;

    const finalImageBuffer = await sharp(baseImage)
      .composite([
        { input: Buffer.from(svgOverlay), top: yPos, left: xPos },
        { input: resizedSignature, top: yPos + 105, left: xPos + 50 }
      ]).png().toBuffer();

    // 4. Upload to Cloudinary
    const upload = await cloudinary.uploader.upload(
      `data:image/png;base64,${finalImageBuffer.toString("base64")}`,
      { folder: "signed_agreements" }
    );

    // 5. Update Database
    await db.query(`
      UPDATE agreements_form 
      SET owner_signature = ?, 
          owner_signed_at = NOW(),
          agreement_status = 'approved', 
          signed_pdf = ?, 
          owner_ip_address = ?, 
          owner_device_info = ?, 
          owner_location = ?,
          terms_accepted = 1
      WHERE booking_id = ?
    `, [owner_signature, upload.secure_url, ownerIp, ownerDevice, location_str || "Not Provided", booking_id]);

    res.json({ success: true, message: "Signed successfully", signed_pdf: upload.secure_url });

  } catch (err) {
    console.error("Signing Error:", err);
    res.status(500).json({ success: false, message: "Internal failure" });
  }
};

/* ================= UTILITIES ================= */
exports.getOwnerPayments = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT b.id AS booking_id, b.name AS tenant_name, b.owner_amount, af.final_pdf, af.signed_pdf, af.viewed_by_owner
      FROM bookings b
      INNER JOIN payments p ON b.id = p.booking_id
      LEFT JOIN agreements_form af ON b.id = af.booking_id
      WHERE b.owner_id = ? AND p.status = 'paid'
      ORDER BY p.created_at DESC
    `, [req.user.id]);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};