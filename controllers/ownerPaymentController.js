// controllers/ownerPaymentController.js

const db = require("../db");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

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

    const updated = rows.map(r => ({
      ...r,
      owner_signed: !!r.signed_pdf
    }));

    res.json({ success: true, data: updated });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= MARK VIEWED ================= */
exports.markAgreementViewed = async (req, res) => {
  const { booking_id } = req.body;

  try {
    await db.query(`
      UPDATE agreements_form 
      SET viewed_by_owner = 1
      WHERE booking_id = ?
    `, [booking_id]);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to mark viewed" });
  }
};

/* ================= SIGN AGREEMENT ================= */
exports.signOwnerAgreement = async (req, res) => {
  const { booking_id, owner_mobile, owner_signature, accepted_terms } = req.body;

  try {
    if (!accepted_terms || !owner_signature) {
      return res.status(400).json({ message: "Terms & Signature required" });
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
      return res.status(404).json({ message: "PDF not found" });
    }

    let originalPdf;

    if (rows[0].final_pdf.startsWith("http")) {
      const response = await axios.get(rows[0].final_pdf, { responseType: "arraybuffer" });
      originalPdf = Buffer.from(response.data);
    } else {
      originalPdf = fs.readFileSync(path.join(__dirname, "../", rows[0].final_pdf));
    }

    const pdfDoc = await PDFDocument.load(originalPdf);

    const base64Data = owner_signature.split(",")[1] || owner_signature;
    const pngImage = await pdfDoc.embedPng(Buffer.from(base64Data, "base64"));

    const page = pdfDoc.getPages().pop();
    const { width } = page.getSize();

    page.drawImage(pngImage, {
      x: width - 180,
      y: 80,
      width: 120,
      height: 50
    });

    page.drawText(`Digitally Signed on ${new Date().toLocaleString()}`, {
      x: width - 180,
      y: 65,
      size: 8
    });

    const pdfBytes = await pdfDoc.save();

    const fileName = `signed_${booking_id}_${Date.now()}.pdf`;
    const signedPath = `uploads/signed_agreements/${fileName}`;
    const fullPath = path.join(__dirname, "../", signedPath);

    if (!fs.existsSync(path.dirname(fullPath))) {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    }

    fs.writeFileSync(fullPath, pdfBytes);

    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const device = req.headers["user-agent"];

    await db.query(`
      UPDATE agreements_form 
      SET 
        owner_signature = ?, 
        mobile = ?, 
        owner_signed_at = NOW(),
        agreement_status = 'approved',
        viewed_by_owner = 1,
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
      signedPath,
      booking_id
    ]);

    res.json({
      success: true,
      message: "Signed successfully",
      signed_pdf: signedPath
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
        COUNT(*) AS total_bookings,
        SUM(owner_amount) AS total_earned
      FROM bookings
      WHERE owner_id = ?
    `, [ownerId]);

    res.json({ success: true, data: rows[0] });

  } catch (err) {
    res.status(500).json({ success: false });
  }
};