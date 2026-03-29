const db = require("../db");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

async function embedSignatureIntoPDF(originalPath, signatureBase64, outputPath) {
  const pdfBytes = fs.readFileSync(originalPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const base64Data = signatureBase64.split(",")[1];
  const pngImage = await pdfDoc.embedPng(Buffer.from(base64Data, "base64"));
  
  const pages = pdfDoc.getPages();
  const page = pages[pages.length - 1];
  page.drawImage(pngImage, { x: page.getSize().width - 180, y: 80, width: 120, height: 50 });

  const newPdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, newPdfBytes);
}

exports.getOwnerPayments = async (req, res) => {
  try {
    const ownerId = req.user.mysqlId || req.user.id;
    const [rows] = await db.query(`
      SELECT b.id AS booking_id, b.name AS tenant_name, b.owner_amount,
             af.final_pdf, af.signed_pdf, af.agreement_status
      FROM bookings b
      LEFT JOIN agreements_form af ON b.id = af.booking_id 
      WHERE b.owner_id = ? 
    `, [ownerId]);

    const updated = rows.map(r => ({
      ...r,
      owner_signed: !!r.signed_pdf
    }));
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false }); }
};

exports.signOwnerAgreement = async (req, res) => {
  const { booking_id, owner_mobile, owner_signature } = req.body;
  try {
    const [rows] = await db.query(`SELECT final_pdf FROM agreements_form WHERE booking_id = ?`, [booking_id]);
    const originalPdf = path.join(__dirname, "../", rows[0].final_pdf);
    const signedPath = `uploads/signed_${booking_id}_${Date.now()}.pdf`;
    
    await embedSignatureIntoPDF(originalPdf, owner_signature, path.join(__dirname, "../", signedPath));

    await db.query(`
      UPDATE agreements_form SET 
      owner_signature = ?, mobile = ?, owner_signed_at = NOW(), signed_pdf = ? 
      WHERE booking_id = ?
    `, [owner_signature, owner_mobile, signedPath, booking_id]);

    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};