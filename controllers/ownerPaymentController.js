const db = require("../db");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

/* ================= HELPERS ================= */
async function embedSignatureIntoPDF(originalPath, signatureBase64, outputPath) {
  const pdfBytes = fs.readFileSync(originalPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Clean base64 string
  const base64Data = signatureBase64.replace(/^data:image\/png;base64,/, "");
  const pngImage = await pdfDoc.embedPng(Buffer.from(base64Data, 'base64'));
  
  const pages = pdfDoc.getPages();
  const page = pages[pages.length - 1]; // Sign on the last page
  const { width } = page.getSize();

  // Position: Bottom Right
  page.drawImage(pngImage, {
    x: width - 180,
    y: 70,
    width: 120,
    height: 50,
  });

  page.drawText(`Digitally Signed on: ${new Date().toLocaleString()}`, {
    x: width - 180,
    y: 55,
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
      owner_signed: !!r.signed_pdf // If signed_pdf exists, it's signed
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
    // 1. Validation
    const [rows] = await db.query(`SELECT final_pdf FROM agreements_form WHERE booking_id = ?`, [booking_id]);
    if (!rows.length || !rows[0].final_pdf) return res.status(404).json({ message: "PDF not found" });

    // 2. Paths
    const originalPdfPath = path.join(__dirname, "../", rows[0].final_pdf);
    const fileName = `signed_${booking_id}_${Date.now()}.pdf`;
    const relativePath = `uploads/signed_agreements/${fileName}`;
    const fullOutputPath = path.join(__dirname, "../", relativePath);

    // Ensure directory exists
    if (!fs.existsSync(path.dirname(fullOutputPath))) {
      fs.mkdirSync(path.dirname(fullOutputPath), { recursive: true });
    }

    // 3. Process PDF
    await embedSignatureIntoPDF(originalPdfPath, owner_signature, fullOutputPath);

    // 4. Update DB (Audit Trail)
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const device = req.headers["user-agent"];

    await db.query(`
      UPDATE agreements_form 
      SET 
        owner_signature = ?, 
        mobile = ?, 
        owner_signed_at = NOW(),
        agreement_status = 'approved',
        ip_address = ?,
        device_info = ?,
        signed_pdf = ?
      WHERE booking_id = ?
    `, [owner_signature, owner_mobile, ip, device, relativePath, booking_id]);

    res.json({ success: true, message: "Signed and stored separately ✅" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Signing failed" });
  }
};