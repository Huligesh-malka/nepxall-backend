const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const crypto = require("crypto");

exports.generateAgreementPDF = async ({
  booking,
  owner,
  user,
  pg,
  ownerSignaturePath
}) => {
  const dir = path.join(__dirname, "..", "uploads", "agreements");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const fileName = `agreement-booking-${booking.id}.pdf`;
  const filePath = path.join(dir, fileName);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(18).text("RENT AGREEMENT", { align: "center" });
  doc.moveDown(2);

  doc.fontSize(12).text(`Agreement ID: AG-${booking.id}`);
  doc.text(`Date: ${new Date().toDateString()}`);
  doc.moveDown();

  doc.text(`OWNER DETAILS`);
  doc.text(`Name: ${owner.name}`);
  doc.text(`Phone: ${owner.phone}`);
  doc.moveDown();

  doc.text(`TENANT DETAILS`);
  doc.text(`Name: ${user.name}`);
  doc.text(`Phone: ${user.phone}`);
  doc.moveDown();

  doc.text(`PROPERTY DETAILS`);
  doc.text(`PG Name: ${pg.pg_name}`);
  doc.text(`Address: ${pg.address}`);
  doc.moveDown();

  doc.text(`RENT DETAILS`);
  doc.text(`Monthly Rent: ₹${booking.rent_amount}`);
  doc.text(`Security Deposit: ₹${booking.deposit_amount}`);
  doc.moveDown(2);

  doc.text(
    "This agreement is digitally generated and legally binding. The owner has provided consent and digital signature during verification.",
    { align: "justify" }
  );

  doc.moveDown(3);
  doc.text("Owner Signature:");

  doc.image(
    path.join(__dirname, "..", ownerSignaturePath),
    { width: 120 }
  );

  doc.end();

  const hash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");

  return {
    agreement_file: `/uploads/agreements/${fileName}`,
    agreement_hash: hash
  };
};
