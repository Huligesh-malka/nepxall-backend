// controllers/ownerPaymentController.js

const db = require("../db");
const axios = require("axios");
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;

/* ================= CLOUDINARY ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= GET PAYMENTS ================= */
exports.getOwnerPayments = async (req, res) => {
  try {
    const ownerId = req.user.mysqlId || req.user.id;

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
    console.error(err);
    res.status(500).json({ success: false });
  }
};

/* ================= MARK VIEWED ================= */
exports.markAgreementViewed = async (req, res) => {
  try {
    await db.query(
      `UPDATE agreements_form SET viewed_by_owner = 1 WHERE booking_id = ?`,
      [req.body.booking_id]
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
};

/* ================= SIGN AGREEMENT ================= */
exports.signOwnerAgreement = async (req, res) => {
  const { booking_id, owner_mobile, owner_signature, accepted_terms } = req.body;

  try {
    if (!accepted_terms || !owner_signature) {
      return res.status(400).json({ message: "Signature required" });
    }

    /* ===== ALREADY SIGNED CHECK ===== */
    const [existing] = await db.query(
      `SELECT signed_pdf FROM agreements_form WHERE booking_id = ?`,
      [booking_id]
    );

    if (existing[0]?.signed_pdf) {
      return res.status(400).json({ message: "Already signed" });
    }

    /* ===== GET BASE IMAGE ===== */
    const [rows] = await db.query(
      `SELECT final_pdf FROM agreements_form WHERE booking_id = ?`,
      [booking_id]
    );

    const imageUrl = rows[0].final_pdf;

    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer"
    });

    const baseImage = Buffer.from(response.data);

    /* ===== SIGNATURE ===== */
    const base64Data = owner_signature.split(",")[1];
    const signatureBuffer = Buffer.from(base64Data, "base64");

    const resizedSignature = await sharp(signatureBuffer)
      .resize(220, 90)
      .png()
      .toBuffer();

    /* ===== IP ===== */
    const rawIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const ip = rawIp ? rawIp.split(",")[0].trim() : "Unknown";

    /* ===== DEVICE ===== */
    const ua = req.headers["user-agent"] || "";
    let device = "Unknown";

    if (ua.includes("Chrome")) device = "Chrome Browser";
    else if (ua.includes("Safari")) device = "Safari Browser";
    else if (ua.includes("Firefox")) device = "Firefox Browser";
    else if (ua.includes("Mobile")) device = "Mobile Device";

    /* ===== LOCATION ===== */
    let location = "India";
    try {
      const geo = await axios.get(`http://ip-api.com/json/${ip}`);
      location = `${geo.data.city}, ${geo.data.regionName}, ${geo.data.country}`;
    } catch {}

    /* ===== TIME ===== */
    const now = new Date();

    const formattedDate = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(now);

    const formattedTime = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }).format(now);

    /* ===== POSITION (MATCH TENANT) ===== */
    const metadata = await sharp(baseImage).metadata();

    const x = metadata.width - 380; // 🔥 FIXED ALIGNMENT
    const y = metadata.height - 200;

    /* ===== UPDATED SVG (MATCH TENANT FORMAT EXACTLY) ===== */
    const svg = `
    <svg width="350" height="160">
      <text x="0" y="18" font-family="Arial" font-size="13" fill="black">
        Digitally Signed
      </text>

      <text x="0" y="38" font-family="Arial" font-size="11" fill="#444">
        Mobile: ${owner_mobile}
      </text>

      <text x="0" y="55" font-family="Arial" font-size="11" fill="#444">
        Location: ${location}
      </text>

      <text x="0" y="72" font-family="Arial" font-size="11" fill="#444">
        Date: ${formattedDate} ${formattedTime}
      </text>
    </svg>
    `;

    const textBuffer = Buffer.from(svg);

    /* ===== MERGE ===== */
    const finalImage = await sharp(baseImage)
      .composite([
        { input: textBuffer, top: y - 140, left: x },
        { input: resizedSignature, top: y - 70, left: x }
      ])
      .png()
      .toBuffer();

    /* ===== UPLOAD ===== */
    const upload = await cloudinary.uploader.upload(
      `data:image/png;base64,${finalImage.toString("base64")}`,
      {
        folder: "signed_agreements",
        resource_type: "image"
      }
    );

    /* ===== SAVE ===== */
    await db.query(`
      UPDATE agreements_form 
      SET 
        owner_signature = ?, 
        mobile = ?, 
        owner_signed_at = NOW(),
        agreement_status = 'approved',
        signed_pdf = ?,
        ip_address = ?,
        device_info = ?,
        terms_accepted = 1
      WHERE booking_id = ?
    `, [
      owner_signature,
      owner_mobile,
      upload.secure_url,
      ip,
      device,
      booking_id
    ]);

    res.json({
      success: true,
      signed_pdf: upload.secure_url
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Signing failed ❌" });
  }
};

/* ================= SUMMARY ================= */
exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const ownerId = req.user.mysqlId || req.user.id;

    const [rows] = await db.query(`
      SELECT 
        COUNT(*) AS total_bookings,
        SUM(owner_amount) AS total_earned
      FROM bookings
      WHERE owner_id = ?
    `, [ownerId]);

    res.json({ success: true, data: rows[0] });

  } catch {
    res.status(500).json({ success: false });
  }
};