const db = require("../db");
const cloudinary = require("cloudinary").v2;
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const axios = require("axios");
const { decrypt } = require("../utils/encryption");



/* ================= CLOUDINARY CONFIG ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= PRE-OTP VERIFICATION ================= */
exports.verifyOwnerForBooking = async (req, res) => {
  const { booking_id, mobile } = req.body;
  try {
    const [rows] = await db.query(`
      SELECT u.phone FROM bookings b
      JOIN users u ON b.owner_id = u.id
      WHERE b.id = ?
    `, [booking_id]);

    if (!rows.length) return res.status(404).json({ success: false, message: "Booking not found" });

    const dbPhone = rows[0].phone.replace(/\D/g, '');
    const inputPhone = mobile.replace(/\D/g, '');

    if (dbPhone.endsWith(inputPhone) || inputPhone.endsWith(dbPhone)) {
      return res.json({ success: true, message: "Owner verified. Proceeding to OTP." });
    } else {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};



exports.signOwnerAgreement = async (req, res) => {
  const { booking_id, owner_mobile, owner_signature, accepted_terms, owner_device_info, owner_location } = req.body;

  try {
    if (!accepted_terms || !owner_signature || !booking_id || !owner_mobile) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // 1. Get PDF from DB
    const [rows] = await db.query(
      "SELECT final_pdf FROM agreements_form WHERE booking_id = ?",
      [booking_id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Agreement not found" });
    }

    const pdfUrl = rows[0].final_pdf;

    // 2. Download PDF
    const pdfBytes = await axios.get(pdfUrl, { responseType: "arraybuffer" });

    // 3. Load PDF
    const pdfDoc = await PDFDocument.load(pdfBytes.data);
    const pages = pdfDoc.getPages();
    const page = pages[pages.length - 1]; // last page

    const { width, height } = page.getSize();

    // 4. Prepare signature image
    const base64Data = owner_signature.replace(/^data:image\/\w+;base64,/, "");
    const sigBuffer = Buffer.from(base64Data, "base64");

    const pngImage = await pdfDoc.embedPng(sigBuffer);

    // 5. Embed font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // 6. Draw signature
    page.drawImage(pngImage, {
      x: width - 220,
      y: 80,
      width: 150,
      height: 50,
    });

    // 7. Draw text
    const date = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    page.drawText("Digitally Signed by Owner", {
      x: width - 220,
      y: 150,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });

    page.drawText(`Mobile: ${owner_mobile}`, {
      x: width - 220,
      y: 135,
      size: 9,
      font,
    });

    page.drawText(`Date: ${date}`, {
      x: width - 220,
      y: 120,
      size: 9,
      font,
    });

    page.drawText("Auth: OTP Verified", {
      x: width - 220,
      y: 105,
      size: 9,
      font,
    });

    // 8. Save PDF
    const finalPdfBytes = await pdfDoc.save();

    // 9. Upload to Cloudinary
    const upload = await cloudinary.uploader.upload(
      `data:application/pdf;base64,${Buffer.from(finalPdfBytes).toString("base64")}`,
      {
        resource_type: "raw",
        folder: "signed_agreements",
        format: "pdf"
      }
    );

    // 10. Save to DB
    await db.query(`
      UPDATE agreements_form 
      SET owner_signature = ?, 
          owner_signed_at = NOW(),
          agreement_status = 'approved',
          signed_pdf = ?,
          owner_device_info = ?
      WHERE booking_id = ?
    `, [owner_signature, upload.secure_url, owner_device_info, booking_id]);

    res.json({
      success: true,
      message: "PDF signed successfully",
      signed_pdf: upload.secure_url
    });

  } catch (err) {
    console.error("PDF SIGN ERROR:", err);
    res.status(500).json({ success: false, message: "Internal failure" });
  }
};

exports.getOwnerPayments = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.name AS tenant_name,

        /* ✅ OWNER AMOUNT (INCLUDING MAINTENANCE) */
        (
          COALESCE(b.rent_amount, 0) + 
          COALESCE(b.security_deposit, 0) + 
          COALESCE(b.maintenance_amount, 0)
        ) AS owner_amount,

        /* 🔥 TOTAL PAID (FOR DEBUG / REFERENCE) */
        p.amount AS total_paid_amount,

        b.owner_settlement,
        b.admin_settlement,
        b.settlement_date,
        b.room_type,

        /* 🔥 FIX: REMOVE "0" VALUE */
        COALESCE(NULLIF(af.final_pdf, '0'), NULL) AS final_pdf,
        COALESCE(NULLIF(af.signed_pdf, '0'), NULL) AS signed_pdf,
        af.viewed_by_owner,

        p.order_id,
        pg.pg_name,

        CASE 
          WHEN EXISTS (
            SELECT 1 
            FROM pg_checkins pc 
            WHERE pc.booking_id = b.id
          ) THEN 'JOINED'
          ELSE 'NOT_JOINED'
        END AS join_status

      FROM bookings b

      INNER JOIN payments p 
        ON b.id = p.booking_id

      LEFT JOIN agreements_form af 
        ON b.id = af.booking_id

      LEFT JOIN pgs pg 
        ON pg.id = b.pg_id

      WHERE b.owner_id = ?
      AND p.status = 'paid'

      ORDER BY p.created_at DESC
    `, [req.user.id]);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error("Owner payments error:", err);

    res.status(500).json({
      success: false,
      message: "Failed to load owner payments"
    });
  }
};



/* ================= MARK AGREEMENT AS VIEWED ================= */
exports.markAgreementViewed = async (req, res) => {
  try {
    await db.query(`UPDATE agreements_form SET viewed_by_owner = 1 WHERE booking_id = ?`, [req.body.booking_id]);
    res.json({ success: true });
  } catch (err) { 
    res.status(500).json({ success: false }); 
  }
};

/* ================= GET OWNER SETTLEMENT SUMMARY ================= */
exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT COUNT(*) AS total_bookings, IFNULL(SUM(owner_amount), 0) AS total_earned
      FROM bookings WHERE owner_id = ?
    `, [req.user.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) { 
    res.status(500).json({ success: false }); 
  }
};



/* ================= GET OWNER RECEIPT DETAILS ================= */


exports.getOwnerReceiptDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const [rows] = await db.query(
      `SELECT 
        b.id AS receipt_no,
        b.order_id, 
        b.updated_at AS verified_date,
        b.settlement_date,

        b.name AS tenant_name,
        b.phone AS tenant_phone,

        pg.pg_name,
        pg.location,
        pr.room_no,
        b.room_type,

        u.id AS owner_id,
        u.name AS owner_name,
        u.phone AS owner_phone,

        obd.account_holder_name,
        obd.account_number,
        obd.ifsc,
        obd.bank_name,
        obd.branch,

        b.rent_amount,
        b.security_deposit,
        b.maintenance_amount,

        (b.rent_amount + b.security_deposit + b.maintenance_amount) AS total_amount,

        b.status,
        b.owner_settlement

      FROM bookings b
      JOIN payments pay ON pay.booking_id = b.id
      LEFT JOIN pgs pg ON pg.id = b.pg_id
      LEFT JOIN pg_rooms pr ON pr.id = b.room_id
      LEFT JOIN users u ON u.id = b.owner_id
      LEFT JOIN owner_bank_details obd 
        ON obd.owner_id = b.owner_id
      WHERE b.id = ?
      AND pay.status = 'paid'
      `,
      [bookingId]
    );

    if (!rows.length) {
      return res.json({
        success: true,
        data: null
      });
    }

    const data = rows[0];

    /* ======================================================
       🔐 DECRYPT BANK DETAILS
    ====================================================== */
    try {
      if (data.account_holder_name) {
        data.account_holder_name = decrypt(data.account_holder_name);
      }

      if (data.account_number) {
        const acc = decrypt(data.account_number);
        data.account_number = "XXXX" + acc.slice(-4); // ✅ MASK
      }

      if (data.ifsc) {
        data.ifsc = decrypt(data.ifsc); // ✅ SHOW FULL IFSC
      }

    } catch (err) {
      console.log("⚠️ Decryption failed (old data or invalid format)");
    }

    res.json({
      success: true,
      data
    });

  } catch (err) {
    console.error("❌ OWNER RECEIPT ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.sqlMessage || err.message
    });
  }
};




/* ================= MARK AS PAID ================= */
exports.markAsPaid = async (req, res) => {
  try {
    const { booking_id } = req.body;

    await db.query(`
      UPDATE bookings 
      SET owner_settlement = 'DONE',
          settlement_date = NOW()
      WHERE id = ?
    `, [booking_id]);

    await db.query(`
      UPDATE settlement_history
      SET owner_settlement = 'DONE'
      WHERE booking_id = ?
    `, [booking_id]);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};