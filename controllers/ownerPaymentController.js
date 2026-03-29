const db = require("../db");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

/* ================= PDF SIGN FUNCTION ================= */
async function embedSignatureIntoPDF(originalPath, signatureBase64, outputPath) {
  const pdfBytes = fs.readFileSync(originalPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const pngImage = await pdfDoc.embedPng(signatureBase64);
  const pages = pdfDoc.getPages();
  const page = pages[pages.length - 1];

  const { width } = page.getSize();

  // Position bottom-right
  page.drawImage(pngImage, {
    x: width - 180,
    y: 80,
    width: 120,
    height: 50,
  });

  page.drawText("Digitally Signed by Owner", {
    x: width - 180,
    y: 60,
    size: 10,
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
        b.phone,
        b.owner_amount,
        b.owner_settlement,
        b.settlement_date,
        b.status AS booking_status,
        pg.pg_name,
        p.status AS payment_status,
        p.amount AS payment_amount,
        p.created_at AS payment_date,

        af.final_pdf,
        af.agreement_status,
        af.owner_signed_at

      FROM bookings b
      JOIN pgs pg ON pg.id = b.pg_id
      INNER JOIN payments p ON b.id = p.booking_id
      LEFT JOIN agreements_form af ON b.id = af.booking_id 

      WHERE b.owner_id = ? 
      AND p.status = 'paid'
      ORDER BY p.created_at DESC
    `, [ownerId]);

    const updated = rows.map(r => ({
      ...r,
      owner_signed: r.agreement_status === "approved"
    }));

    res.json({ success: true, data: updated });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= SIGN AGREEMENT ================= */
exports.signOwnerAgreement = async (req, res) => {
  const {
    booking_id,
    owner_mobile,
    owner_signature,
    accepted_terms
  } = req.body;

  const ownerId = req.user.mysqlId || req.user.id;

  try {
    /* VALIDATION */
    if (!accepted_terms) {
      return res.status(400).json({ message: "Accept terms first" });
    }

    if (!owner_signature) {
      return res.status(400).json({ message: "Signature required" });
    }

    /* CHECK BOOKING + PDF */
    const [rows] = await db.query(`
      SELECT af.final_pdf 
      FROM bookings b
      LEFT JOIN agreements_form af ON b.id = af.booking_id
      WHERE b.id = ? AND b.owner_id = ?
    `, [booking_id, ownerId]);

    if (!rows.length) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (!rows[0].final_pdf) {
      return res.status(400).json({ message: "PDF not uploaded" });
    }

    const originalPdf = path.join(__dirname, "../", rows[0].final_pdf);
    const signedPdfPath = `uploads/signed_${booking_id}.pdf`;

    /* 🔥 EMBED SIGNATURE */
    await embedSignatureIntoPDF(
      originalPdf,
      owner_signature,
      path.join(__dirname, "../", signedPdfPath)
    );

    /* GET IP + DEVICE */
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const device = req.headers["user-agent"];

    /* SAVE */
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
        final_pdf = ?
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
      message: "Agreement signed & embedded in PDF ✅"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Signing failed" });
  }
};

/* ================= SUMMARY ================= */
exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const ownerId = req.user.mysqlId || req.user.id;

    const [rows] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(owner_amount) as total_earned
      FROM bookings
      WHERE owner_id = ?
    `, [ownerId]);

    res.json({ success: true, data: rows[0] });

  } catch (err) {
    res.status(500).json({ success: false });
  }
};