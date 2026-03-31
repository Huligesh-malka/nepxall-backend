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

    // Matches if the input matches the DB record (handling potential country code prefixes)
    if (dbPhone.endsWith(inputPhone) || inputPhone.endsWith(dbPhone)) {
      return res.json({ success: true, message: "Owner verified. Proceeding to OTP." });
    } else {
      return res.status(403).json({ success: false, message: "This mobile number is not registered for this booking. ❌" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ================= OWNER SIDE: SIGN AGREEMENT ================= */
exports.signOwnerAgreement = async (req, res) => {
  const { booking_id, owner_mobile, owner_signature, accepted_terms, owner_device_info } = req.body;

  try {
    if (!accepted_terms || !owner_signature || !booking_id || !owner_mobile) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const [verification] = await db.query(`
      SELECT af.final_pdf 
      FROM agreements_form af
      WHERE af.booking_id = ?
    `, [booking_id]);

    if (!verification.length) return res.status(404).json({ success: false, message: "Agreement record not found" });

    // Capture Audit Trail Data (Stored in DB, not shown on PDF)
    const ownerIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "Unknown";
    // We use the device info sent from frontend or the header
    const finalDeviceInfo = owner_device_info || req.headers["user-agent"] || "Unknown Device";
    
    // Formatting Date for the PDF Overlay
    const now = new Date();
    const formattedDate = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true
    }).format(now);

    /* --- IMAGE PROCESSING --- */
    const response = await axios.get(verification[0].final_pdf, { responseType: "arraybuffer" });
    const baseImage = Buffer.from(response.data);
    
    // Process Signature
    const signatureBuffer = Buffer.from(owner_signature.split(",")[1], "base64");
    const resizedSignature = await sharp(signatureBuffer).resize(200, 80).png().toBuffer();
    
    const metadata = await sharp(baseImage).metadata();
    const xPos = metadata.width - 350;
    const yPos = metadata.height - 180;

    // Clean PDF Overlay (No IP/Device shown here)
    const svgOverlay = `
    <svg width="300" height="100">
      <rect x="0" y="0" width="300" height="100" fill="white" fill-opacity="0.8" rx="5"/>
      <text x="10" y="20" font-family="Helvetica" font-size="12" fill="#1b5e20" font-weight="bold">DIGITALLY VERIFIED OWNER</text>
      <text x="10" y="40" font-family="Helvetica" font-size="11" fill="#333">Mobile: +91 ${owner_mobile}</text>
      <text x="10" y="55" font-family="Helvetica" font-size="11" fill="#333">Date: ${formattedDate}</text>
      <text x="10" y="70" font-family="Helvetica" font-size="11" fill="#333">Status: Legally Accepted</text>
    </svg>`;

    const finalImageBuffer = await sharp(baseImage)
      .composite([
        { input: Buffer.from(svgOverlay), top: yPos - 110, left: xPos },
        { input: resizedSignature, top: yPos - 30, left: xPos }
      ]).png().toBuffer();

    // Upload to Cloudinary
    const upload = await cloudinary.uploader.upload(
      `data:image/png;base64,${finalImageBuffer.toString("base64")}`,
      { folder: "signed_agreements", public_id: `signed_${booking_id}_${Date.now()}` }
    );

    /* --- UPDATE DATABASE --- */
    // Stores IP and Device Info for backend records/legal audit
    await db.query(`
      UPDATE agreements_form 
      SET owner_signature = ?, 
          owner_signed_at = NOW(),
          agreement_status = 'approved', 
          signed_pdf = ?, 
          owner_ip_address = ?, 
          owner_device_info = ?, 
          terms_accepted = 1,
          owner_mobile = ?
      WHERE booking_id = ?
    `, [
      owner_signature, 
      upload.secure_url, 
      ownerIp.split(",")[0], 
      finalDeviceInfo, 
      owner_mobile,
      booking_id
    ]);

    res.json({ 
      success: true, 
      message: "Agreement signed and verified successfully ✅", 
      signed_pdf: upload.secure_url 
    });

  } catch (err) {
    console.error("Signing Error:", err);
    res.status(500).json({ success: false, message: "Failed to process digital signature" });
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