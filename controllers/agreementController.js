const db = require("../db");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const crypto = require("crypto");

const ensureDir = dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

//////////////////////////////////////////////////////
// CREATE OR LOAD AGREEMENT
//////////////////////////////////////////////////////
exports.getAgreement = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const [[booking]] = await db.query(`
      SELECT b.*, p.owner_id
      FROM bookings b
      JOIN pgs p ON p.id=b.pg_id
      WHERE b.id=?`, [bookingId]);

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    let [[agreement]] = await db.query(
      `SELECT * FROM rent_agreements WHERE booking_id=?`,
      [bookingId]
    );

    if (!agreement) {

      const agreementNumber = `AGR-${new Date().getFullYear()}-${bookingId}`;
      const verificationCode = crypto.randomBytes(3).toString("hex").toUpperCase();

      await db.query(`
        INSERT INTO rent_agreements
        (booking_id, pg_id, owner_id, user_id,
         rent_amount, security_deposit, maintenance_amount,
         move_in_date, agreement_duration_months,
         agreement_number, verification_code,
         expires_at, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,DATE_ADD(?, INTERVAL 6 MONTH),'requested')
      `, [
        bookingId,
        booking.pg_id,
        booking.owner_id,
        booking.user_id,
        booking.rent_amount,
        booking.security_deposit,
        booking.maintenance_amount,
        booking.check_in_date,
        6,
        agreementNumber,
        verificationCode,
        booking.check_in_date
      ]);
    }

    const [[row]] = await db.query(`
      SELECT ra.*,
      p.pg_name, p.address, p.city,
      p.contact_person AS owner_name,
      p.contact_email AS owner_email,
      p.contact_phone AS owner_phone,
      u.name AS tenant_name,
      u.email AS tenant_email,
      u.phone AS tenant_phone
      FROM rent_agreements ra
      JOIN pgs p ON p.id = ra.pg_id
      JOIN users u ON u.id = ra.user_id
      WHERE ra.booking_id=?`, [bookingId]);

    res.json({ data: row });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Agreement load failed" });
  }
};

//////////////////////////////////////////////////////
// STATUS
//////////////////////////////////////////////////////
exports.getAgreementStatus = async (req, res) => {

  const [[row]] = await db.query(
    `SELECT status, tenant_esigned, owner_esigned, final_pdf_generated
     FROM rent_agreements WHERE booking_id=?`,
    [req.params.bookingId]
  );

  res.json(row || {});
};

//////////////////////////////////////////////////////
// OWNER SIGN
//////////////////////////////////////////////////////
exports.ownerESign = async (req, res) => {

  const { bookingId, signatureFile } = req.body;

  await db.query(`
    UPDATE rent_agreements
    SET owner_signature_file=?, owner_esigned=1
    WHERE booking_id=?`,
    [signatureFile, bookingId]);

  res.json({ success: true });
};

//////////////////////////////////////////////////////
// TENANT SIGN → FINAL LOCK
//////////////////////////////////////////////////////
exports.tenantESign = async (req, res) => {

  const { bookingId, signatureFile } = req.body;

  const [[agreement]] = await db.query(
    `SELECT status FROM rent_agreements WHERE booking_id=?`,
    [bookingId]
  );

  if (agreement.status === "completed")
    return res.status(400).json({ message: "Already locked" });

  await db.query(`
    UPDATE rent_agreements
    SET user_signature_file=?,
        tenant_esigned=1,
        tenant_esigned_at=NOW(),
        tenant_ip=?,
        signed_at=NOW(),
        status='completed'
    WHERE booking_id=?`,
    [signatureFile, req.ip, bookingId]);

  await generateFinalPDF(bookingId);

  res.json({ success: true });
};

//////////////////////////////////////////////////////
// FINAL PDF + HASH
//////////////////////////////////////////////////////
const generateFinalPDF = async bookingId => {

  const [[data]] = await db.query(
    `SELECT * FROM rent_agreements WHERE booking_id=?`,
    [bookingId]
  );

  const dir = path.join(__dirname, "../uploads/agreements");
  ensureDir(dir);

  const fileName = `final-${bookingId}.pdf`;
  const filePath = path.join(dir, fileName);

  const doc = new PDFDocument();
  const stream = fs.createWriteStream(filePath);

  doc.pipe(stream);

  doc.fontSize(16).text("RENT AGREEMENT", { align: "center" });
  doc.moveDown();

  doc.text(`Agreement ID: ${data.agreement_number}`);
  doc.text(`Verification Code: ${data.verification_code}`);

  doc.end();

  await new Promise(resolve => stream.on("finish", resolve));

  const buffer = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");

  await db.query(`
    UPDATE rent_agreements
    SET agreement_file=?, agreement_hash=?, final_pdf_generated=1
    WHERE booking_id=?`,
    [`/uploads/agreements/${fileName}`, hash, bookingId]);
};

//////////////////////////////////////////////////////
// DOWNLOAD
//////////////////////////////////////////////////////
exports.downloadAgreement = async (req, res) => {

  const [[row]] = await db.query(
    `SELECT agreement_file FROM rent_agreements WHERE booking_id=?`,
    [req.params.bookingId]
  );

  if (!row?.agreement_file)
    return res.status(404).json({ message: "File not found" });

  res.download(path.join(__dirname, "..", row.agreement_file));
};

//////////////////////////////////////////////////////
// PUBLIC VERIFY (QR API)
//////////////////////////////////////////////////////
exports.verifyAgreement = async (req, res) => {

  const [[row]] = await db.query(
    `SELECT booking_id, signed_at, expires_at
     FROM rent_agreements WHERE agreement_hash=?`,
    [req.params.hash]
  );

  if (!row) return res.json({ valid: false });

  res.json({ valid: true, ...row });
};

//////////////////////////////////////////////////////
// PUBLIC AGREEMENT VIEW (QR → FRONTEND PAGE)
//////////////////////////////////////////////////////
exports.getPublicAgreement = async (req, res) => {

  const [[row]] = await db.query(`
    SELECT ra.*,
    p.pg_name, p.address,
    p.contact_person AS owner_name,
    u.name AS tenant_name
    FROM rent_agreements ra
    JOIN pgs p ON p.id = ra.pg_id
    JOIN users u ON u.id = ra.user_id
    WHERE ra.agreement_hash=?`,
    [req.params.hash]
  );

  if (!row)
    return res.status(404).json({ message: "Invalid agreement" });

  res.json({ data: row });
};