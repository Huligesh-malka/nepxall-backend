// controllers/ownerPaymentController.js

const db = require("../db");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

/* ================= PDF SIGN FUNCTION ================= */
async function embedSignatureIntoPDF(originalPath, signatureBase64, outputPath) {
  const pdfBytes = fs.readFileSync(originalPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const base64Data = signatureBase64.split(",")[1] || signatureBase64;
  const pngImage = await pdfDoc.embedPng(Buffer.from(base64Data, "base64"));

  const pages = pdfDoc.getPages();
  const page = pages[pages.length - 1];
  const { width } = page.getSize();

  page.drawImage(pngImage, {
    x: width - 180,
    y: 80,
    width: 120,
    height: 50,
  });

  page.drawText(`Digitally Signed on ${new Date().toLocaleString()}`, {
    x: width - 180,
    y: 65,
    size: 8,
  });

  const newPdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, newPdfBytes);
}

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
        af.agreement_status,
        af.owner_signed_at
      FROM bookings b
      JOIN pgs pg ON pg.id = b.pg_id
      INNER JOIN payments p ON b.id = p.booking_id
      LEFT JOIN agreements_form af ON b.id = af.booking_id
      WHERE b.owner_id = ? AND p.status = 'paid'
      ORDER BY p.created_at DESC
    `, [ownerId]);

    const updated = rows.map(r => ({
      ...r,
      owner_signed: !!r.signed_pdf // ✅ FIXED
    }));

    res.json({ success: true, data: updated });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= SIGN OWNER AGREEMENT ================= */
exports.signOwnerAgreement = async (req, res) => {
  const { booking_id, owner_mobile, owner_signature, accepted_terms } = req.body;

  try {
    if (!accepted_terms || !owner_signature) {
      return res.status(400).json({ message: "Terms & Signature required" });
    }

    // 🔒 Prevent duplicate signing
    const [existing] = await db.query(
      `SELECT signed_pdf FROM agreements_form WHERE booking_id = ?`,
      [booking_id]
    );

    if (existing.length && existing[0].signed_pdf) {
      return res.status(400).json({ message: "Already signed ❌" });
    }

    const [rows] = await db.query(
      `SELECT final_pdf FROM agreements_form WHERE booking_id = ?`,
      [booking_id]
    );

    if (!rows.length || !rows[0].final_pdf) {
      return res.status(404).json({ message: "Original PDF not found" });
    }

    const finalPdfUrl = rows[0].final_pdf;

    // 🔥 Handle Cloudinary or local file
    let originalPdf;

    if (finalPdfUrl.startsWith("http")) {
      // Download from Cloudinary
      const axios = require("axios");
      const response = await axios.get(finalPdfUrl, { responseType: "arraybuffer" });
      originalPdf = Buffer.from(response.data);
    } else {
      originalPdf = fs.readFileSync(path.join(__dirname, "../", finalPdfUrl));
    }

    const pdfDoc = await PDFDocument.load(originalPdf);

    const base64Data = owner_signature.split(",")[1] || owner_signature;
    const pngImage = await pdfDoc.embedPng(Buffer.from(base64Data, "base64"));

    const pages = pdfDoc.getPages();
    const page = pages[pages.length - 1];
    const { width } = page.getSize();

    page.drawImage(pngImage, {
      x: width - 180,
      y: 80,
      width: 120,
      height: 50,
    });

    page.drawText(`Digitally Signed on ${new Date().toLocaleString()}`, {
      x: width - 180,
      y: 65,
      size: 8,
    });

    const newPdfBytes = await pdfDoc.save();

    const fileName = `signed_${booking_id}_${Date.now()}.pdf`;
    const signedPdfPath = `uploads/signed_agreements/${fileName}`;
    const absolutePath = path.join(__dirname, "../", signedPdfPath);

    if (!fs.existsSync(path.dirname(absolutePath))) {
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    }

    fs.writeFileSync(absolutePath, newPdfBytes);

    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const device = req.headers["user-agent"];

    await db.query(`
      UPDATE agreements_form 
      SET 
        owner_signature = ?, 
        mobile = ?, 
        owner_signed_at = NOW(),
        agreement_status = 'approved',
        terms_accepted = 1,
        ip_address = ?,
        device_info = ?,
        signed_pdf = ?
      WHERE booking_id = ?
    `, [
      owner_signature,
      owner_mobile,
      ip,
      device,
      signedPdfPath,
      booking_id
    ]);

    res.json({
      success: true,
      message: "Agreement Signed Successfully ✅",
      signed_pdf: signedPdfPath
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Signing process failed" });
  }
};

/* ================= OWNER SETTLEMENT SUMMARY ================= */
exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const ownerId = req.user.mysqlId || req.user.id;

    const [rows] = await db.query(`
      SELECT 
        COUNT(*) AS total_bookings,
        SUM(owner_amount) AS total_earned,
        SUM(CASE WHEN status = 'paid' THEN owner_amount ELSE 0 END) AS paid_amount
      FROM bookings
      WHERE owner_id = ?
    `, [ownerId]);

    res.json({
      success: true,
      data: rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};