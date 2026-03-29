const db = require("../db");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");

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

/* ================= SIGN AGREEMENT ================= */
exports.signOwnerAgreement = async (req, res) => {
  const { booking_id, owner_mobile, owner_signature, accepted_terms } = req.body;

  try {
    if (!accepted_terms || !owner_signature) {
      return res.status(400).json({ message: "Signature required" });
    }

    // prevent duplicate signing
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

    if (!rows.length || !rows[0].final_pdf) {
      return res.status(404).json({ message: "Image not found" });
    }

    const imageUrl = rows[0].final_pdf;

    // ================= LOAD IMAGE =================
    let baseImage;

    if (imageUrl.startsWith("http")) {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer"
      });
      baseImage = Buffer.from(response.data);
    } else {
      baseImage = fs.readFileSync(path.join(__dirname, "../", imageUrl));
    }

    // ================= SIGNATURE =================
    if (!owner_signature.includes("base64")) {
      return res.status(400).json({ message: "Invalid signature" });
    }

    const base64Data = owner_signature.split(",")[1];
    const signatureBuffer = Buffer.from(base64Data, "base64");

    const signatureWidth = 200;
    const signatureHeight = 80;

    const resizedSignature = await sharp(signatureBuffer)
      .resize(signatureWidth, signatureHeight)
      .png()
      .toBuffer();

    // ================= IMAGE SIZE =================
    const metadata = await sharp(baseImage).metadata();

    const margin = 30;

    // ✅ OWNER SIGNATURE (BOTTOM RIGHT)
    const ownerX = metadata.width - signatureWidth - margin;
    const ownerY = metadata.height - signatureHeight - margin;

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

    // ================= SAVE =================
    const fileName = `signed_${booking_id}_${Date.now()}.png`;
    const outputPath = `uploads/signed/${fileName}`;
    const fullPath = path.join(__dirname, "../", outputPath);

    if (!fs.existsSync(path.dirname(fullPath))) {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    }

    fs.writeFileSync(fullPath, finalImage);

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
      outputPath,
      booking_id
    ]);

    res.json({
      success: true,
      signed_pdf: outputPath
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