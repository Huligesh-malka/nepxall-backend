const db = require("../db");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

/* ================= HELPERS ================= */
async function embedSignatureIntoPDF(originalPath, signatureBase64, outputPath) {
  const pdfBytes = fs.readFileSync(originalPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Remove the data:image/png;base64 prefix if present
  const base64Data = signatureBase64.split(",")[1] || signatureBase64;
  const pngImage = await pdfDoc.embedPng(Buffer.from(base64Data, "base64"));
  
  const pages = pdfDoc.getPages();
  const page = pages[pages.length - 1]; // Sign on the last page
  const { width } = page.getSize();

  // Position: Bottom Right
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

/* ================= CONTROLLERS ================= */

exports.getOwnerPayments = async (req, res) => {
  try {
    const ownerId = req.user.mysqlId || req.user.id;

    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id, b.name AS tenant_name, b.owner_amount,
        pg.pg_name,
        af.final_pdf, af.signed_pdf, af.agreement_status, af.owner_signed_at
      FROM bookings b
      JOIN pgs pg ON pg.id = b.pg_id
      INNER JOIN payments p ON b.id = p.booking_id
      LEFT JOIN agreements_form af ON b.id = af.booking_id 
      WHERE b.owner_id = ? AND p.status = 'paid'
      ORDER BY p.created_at DESC
    `, [ownerId]);

    const updated = rows.map(r => ({
      ...r,
      owner_signed: r.agreement_status === "approved" || !!r.signed_pdf
    }));

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.signOwnerAgreement = async (req, res) => {
  const { booking_id, owner_mobile, owner_signature, accepted_terms } = req.body;
  const ownerId = req.user.mysqlId || req.user.id;

  try {
    if (!accepted_terms || !owner_signature) {
      return res.status(400).json({ message: "Terms and Signature required" });
    }

    // Get Original PDF path
    const [rows] = await db.query(
      `SELECT final_pdf FROM agreements_form WHERE booking_id = ?`, 
      [booking_id]
    );

    if (!rows.length || !rows[0].final_pdf) {
      return res.status(404).json({ message: "Original PDF not found" });
    }

    const originalPdf = path.join(__dirname, "../", rows[0].final_pdf);
    const fileName = `signed_${booking_id}_${Date.now()}.pdf`;
    const signedPdfPath = `uploads/signed_agreements/${fileName}`;
    const absoluteOutputPath = path.join(__dirname, "../", signedPdfPath);

    // Ensure directory exists
    const dir = path.dirname(absoluteOutputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Embed Signature
    await embedSignatureIntoPDF(originalPdf, owner_signature, absoluteOutputPath);

    // Audit Trail Data
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
    `, [owner_signature, owner_mobile, ip, device, signedPdfPath, booking_id]);

    res.json({ success: true, message: "Agreement Signed & Stored ✅" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Signing process failed" });
  }
};

exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const ownerId = req.user.mysqlId || req.user.id;
    const [rows] = await db.query(
      `SELECT COUNT(*) as total, SUM(owner_amount) as total_earned FROM bookings WHERE owner_id = ?`, 
      [ownerId]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};