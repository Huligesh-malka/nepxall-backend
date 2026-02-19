const db = require("../db");          // ✅ MISSING LINE (MAIN BUG FIX)
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");

/* ======================================================
   STEP 1: REQUEST AGREEMENT
====================================================== */
/* ======================================================
   STEP 1: REQUEST AGREEMENT (NO OWNER VERIFICATION)
====================================================== */
exports.requestAgreement = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const firebaseUid = req.user.uid;

    // get logged-in user
    const [[user]] = await db.query(
      "SELECT id FROM users WHERE firebase_uid=?",
      [firebaseUid]
    );

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // booking must be approved
    const [[booking]] = await db.query(
      "SELECT * FROM bookings WHERE id=? AND status='approved'",
      [bookingId]
    );

    if (!booking) {
      return res.status(400).json({ message: "Booking not approved" });
    }

    // prevent duplicate agreement
    const [[existing]] = await db.query(
      "SELECT id FROM rent_agreements WHERE booking_id=?",
      [bookingId]
    );

    if (existing) {
      return res.json({
        success: true,
        message: "Agreement already requested"
      });
    }

    // create agreement
    await db.query(
      `INSERT INTO rent_agreements
       (booking_id, pg_id, owner_id, user_id, status)
       VALUES (?, ?, ?, ?, 'requested')`,
      [bookingId, booking.pg_id, booking.owner_id, user.id]
    );

    res.json({ success: true, message: "Agreement requested" });

  } catch (err) {
    console.error("requestAgreement:", err);
    res.status(500).json({ message: err.message });
  }
};


/* ======================================================
   STEP 2: GENERATE DRAFT AGREEMENT (PDF)
====================================================== */
exports.generateDraftAgreement = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { move_in_date, duration_months } = req.body;

    // ✅ JOIN bookings + pgs (VERY IMPORTANT)
    const [[booking]] = await db.query(
      `SELECT 
          b.*,
          p.rent_amount,
          p.security_deposit
       FROM bookings b
       JOIN pgs p ON b.pg_id = p.id
       WHERE b.id = ?`,
      [bookingId]
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const agreementsDir = path.resolve("uploads/agreements");
    if (!fs.existsSync(agreementsDir)) {
      fs.mkdirSync(agreementsDir, { recursive: true });
    }

    const fileName = `agreement-${bookingId}.pdf`;
    const filePath = path.join(agreementsDir, fileName);

    // Create PDF
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);
    doc.fontSize(20).text("RENT AGREEMENT", { align: "center" });
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Booking ID: ${bookingId}`);
    doc.text(`Move-in Date: ${move_in_date}`);
    doc.text(`Duration: ${duration_months} months`);
    doc.text(`Rent Amount: ₹${booking.rent_amount}`);
    doc.text(`Security Deposit: ₹${booking.security_deposit}`);
    doc.moveDown();
    doc.text("This is a draft agreement. Signatures pending.");
    doc.end();

    await new Promise(resolve => stream.on("finish", resolve));

    // ✅ SAVE EVERYTHING TO DB
    await db.query(
      `UPDATE rent_agreements
       SET agreement_file=?,
           move_in_date=?,
           agreement_duration_months=?,
           rent_amount=?,
           security_deposit=?,
           status='draft'
       WHERE booking_id=?`,
      [
        `/uploads/agreements/${fileName}`,
        move_in_date,
        duration_months,
        booking.rent_amount,
        booking.security_deposit,
        bookingId
      ]
    );

    res.json({
      success: true,
      file: `/uploads/agreements/${fileName}`
    });

  } catch (err) {
    console.error("generateDraftAgreement:", err);
    res.status(500).json({ message: err.message });
  }
};


/* ======================================================
   STEP 3: GET AGREEMENT BY BOOKING
====================================================== */
exports.getAgreementByBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const [[agreement]] = await db.query(
      "SELECT * FROM rent_agreements WHERE booking_id=?",
      [bookingId]
    );

    if (!agreement) {
      return res.status(404).json({ message: "Agreement not found" });
    }

    res.json({ success: true, data: agreement });

  } catch (err) {
    console.error("getAgreementByBooking:", err);
    res.status(500).json({ message: err.message });
  }
};
