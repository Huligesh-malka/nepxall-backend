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

/* ================= GET OWNER PAYMENTS ================= */
exports.getOwnerPayments = async (req, res) => {
  try {
    const ownerId = req.user.mysqlId || req.user.id;

    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.name AS tenant_name,
        b.owner_amount,
        pg.pg_name,
        af.final_pdf,
        af.signed_pdf,
        af.viewed_by_owner,
        af.owner_signed_at
      FROM bookings b
      JOIN pgs pg ON pg.id = b.pg_id
      INNER JOIN payments p ON b.id = p.booking_id
      LEFT JOIN agreements_form af ON b.id = af.booking_id
      WHERE b.owner_id = ? AND p.status = 'paid'
      ORDER BY p.created_at DESC
    `, [ownerId]);

    res.json({ success: true, data: rows });

  } catch (err) {
    console.error("GET PAYMENTS ERROR:", err);
    res.status(500).json({ success: false });
  }
};

/* ================= MARK VIEWED ================= */
exports.markAgreementViewed = async (req, res) => {
  const { booking_id } = req.body;

  try {
    await db.query(
      `UPDATE agreements_form SET viewed_by_owner = 1 WHERE booking_id = ?`,
      [booking_id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("VIEW ERROR:", err);
    res.status(500).json({ message: "Failed" });
  }
};

exports.signOwnerAgreement = async (req, res) => {
  const { booking_id, owner_mobile, owner_signature, accepted_terms } = req.body;

  try {
    if (!accepted_terms || !owner_signature) {
      return res.status(400).json({ message: "Signature required" });
    }

    const [existing] = await db.query(
      `SELECT signed_pdf FROM agreements_form WHERE booking_id = ?`,
      [booking_id]
    );

    if (existing.length && existing[0].signed_pdf) {
      return res.status(400).json({ message: "Already signed" });
    }

    const [rows] = await db.query(
      `SELECT final_pdf FROM agreements_form WHERE booking_id = ?`,
      [booking_id]
    );

    const imageUrl = rows[0].final_pdf;

    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer"
    });

    const baseImage = Buffer.from(response.data);

    // ================= SIGNATURE =================
    const base64Data = owner_signature.split(",")[1];
    const signatureBuffer = Buffer.from(base64Data, "base64");

    const signatureWidth = 200;
    const signatureHeight = 80;

    const resizedSignature = await sharp(signatureBuffer)
      .resize(signatureWidth, signatureHeight)
      .png()
      .toBuffer();

    // ================= POSITION =================
    const metadata = await sharp(baseImage).metadata();

    const ownerX = metadata.width - signatureWidth - 40;
    const ownerY = Math.floor(metadata.height * 0.72);

    // ================= LEGAL TEXT =================
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const device = req.headers["user-agent"];
    const date = new Date().toLocaleString();

    const legalText = `
      Digitally Signed by Owner
      Mobile: ${owner_mobile}
      Date: ${date}
      IP: ${ip}
    `;

    const svgText = `
    <svg width="500" height="100">
      <text x="0" y="20" font-size="16" fill="black">Digitally Signed</text>
      <text x="0" y="40" font-size="14" fill="black">Mobile: ${owner_mobile}</text>
      <text x="0" y="60" font-size="14" fill="black">Date: ${date}</text>
      <text x="0" y="80" font-size="12" fill="black">IP: ${ip}</text>
    </svg>
    `;

    const textBuffer = Buffer.from(svgText);

    // ================= MERGE =================
    const finalImage = await sharp(baseImage)
      .composite([
        {
          input: textBuffer,
          top: ownerY - 90,
          left: ownerX
        },
        {
          input: resizedSignature,
          top: ownerY,
          left: ownerX
        }
      ])
      .png()
      .toBuffer();

    // ================= UPLOAD =================
    const uploadResult = await cloudinary.uploader.upload(
      `data:image/png;base64,${finalImage.toString("base64")}`,
      {
        folder: "signed_agreements",
        resource_type: "image"
      }
    );

    const signedUrl = uploadResult.secure_url;

    // ================= SAVE DB =================
    await db.query(`
      UPDATE agreements_form 
      SET 
        owner_signature = ?, 
        mobile = ?, 
        owner_signed_at = NOW(),
        agreement_status = 'approved',
        viewed_by_owner = 1,
        signed_pdf = ?,
        ip_address = ?,
        device_info = ?,
        terms_accepted = 1
      WHERE booking_id = ?
    `, [
      owner_signature,
      owner_mobile,
      signedUrl,
      ip,
      device,
      booking_id
    ]);

    res.json({ success: true, signed_pdf: signedUrl });

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

  } catch (err) {
    console.error("SUMMARY ERROR:", err);
    res.status(500).json({ success: false });
  }
};