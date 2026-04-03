const db = require("../db");
const axios = require("axios");
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;

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

/* ================= OWNER SIDE: SIGN AGREEMENT ================= */
exports.signOwnerAgreement = async (req, res) => {
  const { booking_id, owner_mobile, owner_signature, accepted_terms, owner_device_info, owner_location } = req.body;

  try {
    if (!accepted_terms || !owner_signature || !booking_id || !owner_mobile) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // 1. Capture Metadata
    const rawIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0";
    const ownerIp = rawIp.split(",")[0].trim();
    const deviceDetail = owner_device_info || req.headers["user-agent"] || "Unknown Device";
    const location = owner_location || "Bangalore, Karnataka"; // Fallback if frontend doesn't send geo

    // 2. Fetch Existing Agreement
    const [verification] = await db.query(`
      SELECT af.final_pdf, u.phone 
      FROM agreements_form af
      JOIN bookings b ON af.booking_id = b.id
      JOIN users u ON b.owner_id = u.id
      WHERE af.booking_id = ?
    `, [booking_id]);

    if (!verification.length) return res.status(404).json({ success: false, message: "Agreement not found" });

    // 3. Format Date/Time (IST)
    const formattedDate = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true
    }).format(new Date()).replace(',', ''); // Clean up comma

    // 4. Image Processing (PDF as Image)
    const response = await axios.get(verification[0].final_pdf, { responseType: "arraybuffer" });
    const baseImage = Buffer.from(response.data);
    const signatureBuffer = Buffer.from(owner_signature.split(",")[1], "base64");
    const resizedSignature = await sharp(signatureBuffer).resize(200, 70).png().toBuffer();
    const metadata = await sharp(baseImage).metadata();
    
    const xPos = metadata.width - 380;
    const yPos = metadata.height - 220;

    // 5. Construct Visual Digital Stamp (SVG)
    const svgOverlay = `<svg width="350" height="150">
      <text x="0" y="20" font-family="Arial" font-size="14" fill="black" font-weight="bold">Digitally Signed by Owner</text>
      <text x="0" y="40" font-family="Arial" font-size="12" fill="#333">Mobile: ${owner_mobile}</text>
      <text x="0" y="60" font-family="Arial" font-size="12" fill="#333">Location: ${location}</text>
      <text x="0" y="80" font-family="Arial" font-size="12" fill="#333">Date: ${formattedDate}</text>
      <text x="0" y="100" font-family="Arial" font-size="12" fill="#333" font-weight="bold">Auth: OTP Verified</text>
    </svg>`;

    const finalImageBuffer = await sharp(baseImage)
      .composite([
        { input: Buffer.from(svgOverlay), top: yPos - 110, left: xPos },
        { input: resizedSignature, top: yPos + 10, left: xPos }
      ]).png().toBuffer();

    // 6. Upload to Cloudinary
    const upload = await cloudinary.uploader.upload(
      `data:image/png;base64,${finalImageBuffer.toString("base64")}`,
      { folder: "signed_agreements" }
    );

    // 7. Update Database with Full Audit Trail
    await db.query(`
      UPDATE agreements_form 
      SET owner_signature = ?, 
          owner_signed_at = NOW(),
          agreement_status = 'approved', 
          signed_pdf = ?, 
          owner_ip_address = ?, 
          owner_device_info = ?, 
          terms_accepted = 1
      WHERE booking_id = ?
    `, [owner_signature, upload.secure_url, ownerIp, deviceDetail, booking_id]);

    res.json({ success: true, message: "Signed successfully", signed_pdf: upload.secure_url });

  } catch (err) {
    console.error("Signing Error:", err);
    res.status(500).json({ success: false, message: "Internal failure" });
  }
};

/* ================= OTHER UTILITIES ================= */
exports.getOwnerPayments = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.name AS tenant_name,
        b.owner_amount,
        b.owner_settlement,
        b.settlement_date,

        b.room_type,   -- ✅ ADD THIS (IMPORTANT)

        af.final_pdf,
        af.signed_pdf,
        af.viewed_by_owner

      FROM bookings b

      INNER JOIN payments p 
        ON b.id = p.booking_id

      LEFT JOIN agreements_form af 
        ON b.id = af.booking_id

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

exports.markAgreementViewed = async (req, res) => {
  try {
    await db.query(`UPDATE agreements_form SET viewed_by_owner = 1 WHERE booking_id = ?`, [req.body.booking_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};

exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT COUNT(*) AS total_bookings, IFNULL(SUM(owner_amount), 0) AS total_earned
      FROM bookings WHERE owner_id = ?
    `, [req.user.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false }); }
};


exports.getOwnerReceiptDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const [rows] = await db.query(
      `SELECT 
        b.id AS receipt_no,
        b.order_id, 
        b.updated_at AS verified_date,
        b.settlement_date,

        /* TENANT DETAILS */
        b.name AS tenant_name,
        b.phone AS tenant_phone,

        /* PROPERTY DETAILS */
        p.pg_name,
        p.location,
        pr.room_no,
        b.room_type,

        /* OWNER DETAILS - Linked via bookings.owner_id */
        u.id AS owner_id,
        u.name AS owner_name,
        u.phone AS owner_phone,

        /* BANK DETAILS - Linked via owner_id */
        obd.account_holder_name,
        obd.account_number,
        obd.ifsc,
        obd.bank_name,
        obd.branch,

        /* AMOUNTS */
        COALESCE(b.rent_amount, 0) AS rent_amount,
        COALESCE(b.security_deposit, 0) AS security_deposit,
        COALESCE(b.maintenance_amount, 0) AS maintenance_amount,

        /* TOTAL CALCULATION */
        (COALESCE(b.rent_amount, 0) + COALESCE(b.security_deposit, 0) + COALESCE(b.maintenance_amount, 0)) AS total_amount,

        b.status,
        b.owner_settlement

      FROM bookings b
      JOIN pgs p ON p.id = b.pg_id
      LEFT JOIN pg_rooms pr ON pr.id = b.room_id
      LEFT JOIN users u ON u.id = b.owner_id
      LEFT JOIN owner_bank_details obd ON obd.owner_id = b.owner_id

      WHERE b.id = ? 
      AND b.owner_settlement = 'DONE'`,
      [bookingId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Receipt details not found or settlement is not marked as DONE."
      });
    }

    const data = rows[0];

    // Masking the Bank Account Number for security
    if (data.account_number) {
      const accStr = String(data.account_number);
      data.account_number = "XXXX" + accStr.slice(-4);
    }

    res.json({
      success: true,
      data
    });

  } catch (err) {
    console.error("❌ OWNER RECEIPT ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Database error: " + err.message
    });
  }
};