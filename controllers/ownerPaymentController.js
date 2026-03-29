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

    // prevent duplicate
    const [existing] = await db.query(
      `SELECT signed_pdf FROM agreements_form WHERE booking_id = ?`,
      [booking_id]
    );

    if (existing.length && existing[0].signed_pdf) {
      return res.status(400).json({ message: "Already signed" });
    }

    // get agreement image (Cloudinary URL)
    const [rows] = await db.query(
      `SELECT final_pdf FROM agreements_form WHERE booking_id = ?`,
      [booking_id]
    );

    if (!rows.length || !rows[0].final_pdf) {
      return res.status(404).json({ message: "Image not found" });
    }

    const imageUrl = rows[0].final_pdf;

    // ================= LOAD BASE IMAGE =================
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

    // ================= POSITION FIX (🔥 IMPORTANT) =================
    const metadata = await sharp(baseImage).metadata();

    // 👉 move UP from bottom to align with signature line
    const marginBottom = 110;   // 🔥 adjust here if needed
    const marginRight = 40;

    const ownerX = metadata.width - signatureWidth - marginRight;
    const ownerY = metadata.height - signatureHeight - marginBottom;

    // ================= MERGE =================
    const finalImage = await sharp(baseImage)
      .composite([
        {
          input: resizedSignature,
          top: ownerY,
          left: ownerX
        }
      ])
      .png()
      .toBuffer();

    // ================= UPLOAD TO CLOUDINARY =================
    const base64Image = finalImage.toString("base64");

    const uploadResult = await cloudinary.uploader.upload(
      `data:image/png;base64,${base64Image}`,
      {
        folder: "signed_agreements",
        resource_type: "image"
      }
    );

    const signedUrl = uploadResult.secure_url;

    // ================= UPDATE DB =================
    await db.query(`
      UPDATE agreements_form 
      SET 
        owner_signature = ?, 
        mobile = ?, 
        owner_signed_at = NOW(),
        agreement_status = 'approved',
        viewed_by_owner = 1,
        signed_pdf = ?
      WHERE booking_id = ?
    `, [
      owner_signature,
      owner_mobile,
      signedUrl,
      booking_id
    ]);

    res.json({
      success: true,
      signed_pdf: signedUrl
    });

  } catch (err) {
    console.error("SIGN ERROR:", err);
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