const db = require("../db");
const axios = require("axios");
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;

/* ================= CLOUDINARY ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= SEND OTP ================= */
exports.sendOwnerOtp = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!/^[6-9]\d{9}$/.test(mobile)) {
      return res.status(400).json({ message: "Invalid mobile number" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.query(
      `INSERT INTO owner_otps (mobile, otp, expires_at)
       VALUES (?, ?, ?)`,
      [mobile, otp, expiresAt]
    );

    console.log("📲 OTP:", otp); // replace with SMS API

    res.json({ success: true, message: "OTP sent" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "OTP failed" });
  }
};

/* ================= VERIFY OTP ================= */
exports.verifyOwnerOtp = async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    const [rows] = await db.query(
      `SELECT * FROM owner_otps 
       WHERE mobile=? AND otp=? 
       ORDER BY created_at DESC LIMIT 1`,
      [mobile, otp]
    );

    if (!rows.length) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const record = rows[0];

    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    await db.query(
      `UPDATE owner_otps SET verified=1 WHERE id=?`,
      [record.id]
    );

    res.json({ success: true, message: "OTP verified" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Verification failed" });
  }
};

/* ================= GET PAYMENTS ================= */
exports.getOwnerPayments = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.name AS tenant_name,
        b.owner_amount,
        af.final_pdf,
        af.signed_pdf,
        af.viewed_by_owner
      FROM bookings b
      INNER JOIN payments p ON b.id = p.booking_id
      LEFT JOIN agreements_form af ON b.id = af.booking_id
      WHERE b.owner_id = ? AND p.status = 'paid'
      ORDER BY p.created_at DESC
    `, [ownerId]);

    res.json({ success: true, data: rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

/* ================= MARK VIEWED ================= */
exports.markAgreementViewed = async (req, res) => {
  try {
    await db.query(
      `UPDATE agreements_form SET viewed_by_owner = 1 WHERE booking_id = ?`,
      [req.body.booking_id]
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
};

/* ================= SIGN AGREEMENT ================= */
exports.signOwnerAgreement = async (req, res) => {
  const { booking_id, owner_mobile, owner_signature, accepted_terms } = req.body;

  try {
    /* 🔐 VALIDATION */
    if (!accepted_terms || !owner_signature || !owner_mobile) {
      return res.status(400).json({ message: "All fields required" });
    }

    /* 🔐 OTP CHECK (CRITICAL SECURITY) */
    const [otpCheck] = await db.query(
      `SELECT * FROM owner_otps 
       WHERE mobile=? AND verified=1 
       ORDER BY created_at DESC LIMIT 1`,
      [owner_mobile]
    );

    if (!otpCheck.length) {
      return res.status(403).json({
        message: "OTP not verified"
      });
    }

    /* 🔐 OWNER VALIDATION */
    const [bookingCheck] = await db.query(
      `SELECT owner_id FROM bookings WHERE id=?`,
      [booking_id]
    );

    if (!bookingCheck.length || bookingCheck[0].owner_id !== req.user.id) {
      return res.status(403).json({ message: "Not your booking" });
    }

    /* ===== ALREADY SIGNED ===== */
    const [existing] = await db.query(
      `SELECT signed_pdf FROM agreements_form WHERE booking_id = ?`,
      [booking_id]
    );

    if (existing[0]?.signed_pdf) {
      return res.status(400).json({ message: "Already signed" });
    }

    /* ===== BASE PDF ===== */
    const [rows] = await db.query(
      `SELECT final_pdf FROM agreements_form WHERE booking_id = ?`,
      [booking_id]
    );

    const imageUrl = rows[0].final_pdf;

    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer"
    });

    const baseImage = Buffer.from(response.data);

    /* ===== SIGNATURE ===== */
    const base64Data = owner_signature.split(",")[1];
    const signatureBuffer = Buffer.from(base64Data, "base64");

    const resizedSignature = await sharp(signatureBuffer)
      .resize(220, 90)
      .png()
      .toBuffer();

    /* ===== IP + DEVICE ===== */
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "Unknown";
    const device = req.headers["user-agent"] || "Unknown";

    /* ===== DATE ===== */
    const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    /* ===== POSITION ===== */
    const metadata = await sharp(baseImage).metadata();
    const x = metadata.width - 380;
    const y = metadata.height - 200;

    /* ===== TEXT ===== */
    const svg = `
    <svg width="350" height="160">
      <text x="0" y="18" font-size="13">Digitally Signed by Owner</text>
      <text x="0" y="38" font-size="11">Mobile: ${owner_mobile}</text>
      <text x="0" y="55" font-size="11">Date: ${now}</text>
    </svg>`;

    const finalImage = await sharp(baseImage)
      .composite([
        { input: Buffer.from(svg), top: y - 140, left: x },
        { input: resizedSignature, top: y - 70, left: x }
      ])
      .png()
      .toBuffer();

    /* ===== UPLOAD ===== */
    const upload = await cloudinary.uploader.upload(
      `data:image/png;base64,${finalImage.toString("base64")}`,
      { folder: "signed_agreements" }
    );

    /* ===== SAVE ===== */
    await db.query(`
      UPDATE agreements_form 
      SET 
        owner_signature=?, 
        mobile=?, 
        owner_signed_at=NOW(),
        agreement_status='approved',
        signed_pdf=?,
        ip_address=?,
        device_info=?,
        terms_accepted=1
      WHERE booking_id=?
    `, [
      owner_signature,
      owner_mobile,
      upload.secure_url,
      ip,
      device,
      booking_id
    ]);

    res.json({
      success: true,
      signed_pdf: upload.secure_url
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Signing failed ❌" });
  }
};

/* ================= SUMMARY ================= */
exports.getOwnerSettlementSummary = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const [rows] = await db.query(`
      SELECT 
        COUNT(*) AS total_bookings,
        SUM(owner_amount) AS total_earned
      FROM bookings
      WHERE owner_id = ?
    `, [ownerId]);

    res.json({ success: true, data: rows[0] });

  } catch {
    res.status(500).json({ success: false });
  }
};