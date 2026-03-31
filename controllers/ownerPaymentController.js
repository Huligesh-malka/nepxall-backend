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

/* ================= GET PAYMENTS (Requires Auth) ================= */
exports.getOwnerPayments = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.name AS tenant_name,
        b.owner_amount,
        af.final_pdf,
        af.signed_pdf,
        af.viewed_by_owner
      FROM bookings b
      INNER JOIN payments p ON b.id = p.booking_id
      LEFT JOIN agreements_form af ON b.id = af.booking_id
      WHERE b.owner_id = ? AND p.status = 'paid'
      ORDER BY p.created_at DESC
    `, [ownerId]);
    
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Fetch Payments Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch payments" });
  }
};

/* ================= SIGN AGREEMENT (PUBLIC / NO AUTH) ================= */
exports.signOwnerAgreement = async (req, res) => {
  const { booking_id, owner_mobile, owner_signature, accepted_terms } = req.body;

  try {
    // 1. Basic Validation
    if (!accepted_terms || !owner_signature || !booking_id || !owner_mobile) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // 2. Security Check: Verify mobile matches the owner of this specific booking
    const [verification] = await db.query(`
      SELECT af.signed_pdf, af.final_pdf, u.phone 
      FROM agreements_form af
      JOIN bookings b ON af.booking_id = b.id
      JOIN users u ON b.owner_id = u.id
      WHERE af.booking_id = ?
    `, [booking_id]);

    if (!verification.length) {
      return res.status(404).json({ success: false, message: "Agreement record not found" });
    }

    // Optional: Match phone number digits to ensure the public user is the correct owner
    const cleanDbPhone = verification[0].phone.replace(/\D/g, '');
    const cleanInputPhone = owner_mobile.replace(/\D/g, '');

    if (!cleanDbPhone.includes(cleanInputPhone)) {
      return res.status(403).json({ success: false, message: "Mobile number mismatch for this booking" });
    }

    if (verification[0].signed_pdf) {
      return res.status(400).json({ success: false, message: "Agreement already signed" });
    }

    // 3. Image Processing (Overlaying Signature on PDF/Image)
    const response = await axios.get(verification[0].final_pdf, { responseType: "arraybuffer" });
    const baseImage = Buffer.from(response.data);

    const base64Data = owner_signature.split(",")[1];
    const signatureBuffer = Buffer.from(base64Data, "base64");

    const resizedSignature = await sharp(signatureBuffer)
      .resize(220, 90)
      .png()
      .toBuffer();

    // 4. Generate Metadata
    const rawIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const ip = rawIp ? rawIp.split(",")[0].trim() : "Unknown";
    
    const now = new Date();
    const formattedDate = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true
    }).format(now);

    const metadata = await sharp(baseImage).metadata();
    const xPos = metadata.width - 380;
    const yPos = metadata.height - 200;

    const svgOverlay = `
    <svg width="350" height="100">
      <text x="0" y="18" font-family="Arial" font-size="13" fill="black" font-weight="bold">Digitally Signed by Owner</text>
      <text x="0" y="38" font-family="Arial" font-size="11" fill="#444">Mobile: ${owner_mobile}</text>
      <text x="0" y="58" font-family="Arial" font-size="11" fill="#444">Date: ${formattedDate}</text>
    </svg>`;

    // 5. Composite and Upload to Cloudinary
    const finalImageBuffer = await sharp(baseImage)
      .composite([
        { input: Buffer.from(svgOverlay), top: yPos - 120, left: xPos },
        { input: resizedSignature, top: yPos - 50, left: xPos }
      ])
      .png()
      .toBuffer();

    const upload = await cloudinary.uploader.upload(
      `data:image/png;base64,${finalImageBuffer.toString("base64")}`,
      { folder: "signed_agreements" }
    );

    // 6. Update Database
    await db.query(`
      UPDATE agreements_form 
      SET 
        owner_signature = ?, 
        mobile = ?, 
        owner_signed_at = NOW(),
        agreement_status = 'approved',
        signed_pdf = ?,
        ip_address = ?,
        terms_accepted = 1
      WHERE booking_id = ?
    `, [owner_signature, owner_mobile, upload.secure_url, ip, booking_id]);

    res.json({
      success: true,
      message: "Agreement signed successfully",
      signed_pdf: upload.secure_url
    });

  } catch (err) {
    console.error("Signing Error:", err);
    res.status(500).json({ success: false, message: "Internal signing process failed" });
  }
};

/* ================= MARK VIEWED ================= */
exports.markAgreementViewed = async (req, res) => {
  try {
    const { booking_id } = req.body;
    await db.query(
      `UPDATE agreements_form SET viewed_by_owner = 1 WHERE booking_id = ?`,
      [booking_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

/* ================= SUMMARY ================= */
exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const [rows] = await db.query(`
      SELECT COUNT(*) AS total_bookings, IFNULL(SUM(owner_amount), 0) AS total_earned
      FROM bookings WHERE owner_id = ?
    `, [ownerId]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};