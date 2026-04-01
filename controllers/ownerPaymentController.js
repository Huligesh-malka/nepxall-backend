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

/* ================= OWNER SIDE: SIGN AGREEMENT ================= */
exports.signOwnerAgreement = async (req, res) => {
  const { 
    booking_id, 
    owner_mobile, 
    owner_signature, 
    accepted_terms, 
    owner_device_info,
    location_data // New: Expecting { city: '...', region: '...' } from frontend
  } = req.body;

  try {
    if (!accepted_terms || !owner_signature || !booking_id || !owner_mobile) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // 1. Capture Network Info
    const rawIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0";
    const ownerIp = rawIp.split(",")[0].trim();
    const deviceDetail = owner_device_info || req.headers["user-agent"] || "Unknown Device";
    const locationString = location_data ? `${location_data.city || 'Unknown'}, ${location_data.region || ''}` : "Location Hidden";

    // 2. Fetch Agreement and Tenant Details for the PDF overlay
    const [verification] = await db.query(`
      SELECT af.final_pdf, b.name AS tenant_name, b.mobile AS tenant_mobile
      FROM agreements_form af
      JOIN bookings b ON af.booking_id = b.id
      WHERE af.booking_id = ?
    `, [booking_id]);

    if (!verification.length) return res.status(404).json({ success: false, message: "Agreement not found" });

    const { tenant_name, tenant_mobile, final_pdf } = verification[0];

    // 3. Format Timestamp
    const formattedDate = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true
    }).format(new Date());

    // 4. Image Processing
    const response = await axios.get(final_pdf, { responseType: "arraybuffer" });
    const baseImage = Buffer.from(response.data);
    const signatureBuffer = Buffer.from(owner_signature.split(",")[1], "base64");
    const resizedSignature = await sharp(signatureBuffer).resize(200, 80).png().toBuffer();
    
    const metadata = await sharp(baseImage).metadata();
    const xPos = metadata.width - 400;
    const yPos = metadata.height - 250;

    // 5. Create Enhanced SVG Overlay (Includes Tenant, Mobile, IP, and Location)
    const svgOverlay = `
    <svg width="400" height="160">
      <rect width="100%" height="100%" fill="white" fill-opacity="0.8" rx="10"/>
      <text x="10" y="25" font-family="Arial" font-size="14" fill="#1a73e8" font-weight="bold">DIGITALLY SIGNED DOCUMENT</text>
      <text x="10" y="50" font-family="Arial" font-size="11" fill="black"><b>Tenant:</b> ${tenant_name} (${tenant_mobile})</text>
      <text x="10" y="70" font-family="Arial" font-size="11" fill="black"><b>Owner Mobile:</b> ${owner_mobile}</text>
      <text x="10" y="90" font-family="Arial" font-size="11" fill="black"><b>IP Address:</b> ${ownerIp}</text>
      <text x="10" y="110" font-family="Arial" font-size="11" fill="black"><b>Location:</b> ${locationString}</text>
      <text x="10" y="130" font-family="Arial" font-size="11" fill="black"><b>Timestamp:</b> ${formattedDate}</text>
      <text x="10" y="150" font-family="Arial" font-size="11" fill="#d32f2f">Method: OTP Verified (Aadhaar/Mobile)</text>
    </svg>`;

    // 6. Composite Images
    const finalImageBuffer = await sharp(baseImage)
      .composite([
        { input: Buffer.from(svgOverlay), top: yPos - 140, left: xPos },
        { input: resizedSignature, top: yPos + 30, left: xPos + 10 }
      ]).png().toBuffer();

    // 7. Upload to Cloudinary
    const upload = await cloudinary.uploader.upload(
      `data:image/png;base64,${finalImageBuffer.toString("base64")}`,
      { folder: "signed_agreements", public_id: `signed_${booking_id}_${Date.now()}` }
    );

    // 8. Update Database
    await db.query(`
      UPDATE agreements_form 
      SET owner_signature = ?, 
          owner_signed_at = NOW(),
          agreement_status = 'approved', 
          signed_pdf = ?, 
          owner_ip_address = ?, 
          owner_device_info = ?, 
          terms_accepted = 1
      WHERE booking_id = ?
    `, [owner_signature, upload.secure_url, ownerIp, deviceDetail, booking_id]);

    res.json({ success: true, message: "Agreement Signed & Audited", signed_pdf: upload.secure_url });

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
  } catch (err) { res.status(500).json({ success: false }); }
};

exports.markAgreementViewed = async (req, res) => {
  try {
    await db.query(`UPDATE agreements_form SET viewed_by_owner = 1 WHERE booking_id = ?`, [req.body.booking_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};

exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT COUNT(*) AS total_bookings, IFNULL(SUM(owner_amount), 0) AS total_earned
      FROM bookings WHERE owner_id = ?
    `, [req.user.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false }); }
};