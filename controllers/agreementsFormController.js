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

/* ================= USER: GET AGREEMENT ================= */
exports.getAgreementByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const [rows] = await db.query(
      "SELECT agreement_status, final_pdf, signed_pdf FROM agreements_form WHERE booking_id = ?",
      [bookingId]
    );

    if (rows.length > 0) {
      return res.json({
        success: true,
        exists: true,
        data: rows[0]
      });
    }

    res.json({ success: true, exists: false });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
};

/* ================= USER: SUBMIT FORM ================= */
exports.submitAgreementForm = async (req) => {
  try {
    const {
      user_id, booking_id, full_name, father_name, mobile, email,
      address, city, state, pincode, aadhaar_last4, pan_number,
      checkin_date, agreement_months, rent, deposit, maintenance,
    } = req.body;

    const files = req.files || {};
    const signature = files["signature"]?.[0]?.path || null;
    const aadhaar_front = files["aadhaar_front"]?.[0]?.path || null;
    const aadhaar_back = files["aadhaar_back"]?.[0]?.path || null;
    const pan_card = files["pan_card"]?.[0]?.path || null;

    const sql = `
      INSERT INTO agreements_form (
        user_id, booking_id, full_name, father_name, mobile, email,
        address, city, state, pincode, aadhaar_last4, pan_number,
        checkin_date, agreement_months, rent, deposit, maintenance,
        signature, aadhaar_front, aadhaar_back, pan_card, agreement_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `;

    const values = [
      user_id, booking_id, full_name, father_name, mobile, email,
      address, city, state, pincode, aadhaar_last4, pan_number,
      checkin_date, agreement_months, rent, deposit, maintenance,
      signature, aadhaar_front, aadhaar_back, pan_card
    ];

    const [result] = await db.query(sql, values);
    return { insertId: result.insertId };

  } catch (error) {
    throw error;
  }
};

/* ================= ADMIN: GET ALL ================= */
exports.getAllAgreements = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM agreements_form ORDER BY id DESC");
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false });
  }
};

/* ================= ADMIN: GET SINGLE ================= */
exports.getAgreementById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query("SELECT * FROM agreements_form WHERE id = ?", [id]);

    if (!rows.length) return res.status(404).json({ success: false });

    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false });
  }
};

/* ================= ADMIN: UPLOAD ESTAMP ================= */
exports.uploadFinalImage = async (req, res) => {
  try {
    const { id } = req.params;
    const imageUrl = req.file?.path;

    if (!imageUrl) return res.status(400).json({ success: false });

    await db.query(
      "UPDATE agreements_form SET final_pdf = ?, agreement_status = 'uploaded' WHERE id = ?",
      [imageUrl, id]
    );

    res.json({ success: true, imageUrl });

  } catch {
    res.status(500).json({ success: false });
  }
};

/* ================= OWNER SIGN ================= */
exports.ownerSign = async (req, res) => {
  try {
    const { booking_id, owner_signature } = req.body;

    const [rows] = await db.query(
      "SELECT final_pdf FROM agreements_form WHERE booking_id = ?",
      [booking_id]
    );

    const baseImage = Buffer.from(
      (await axios.get(rows[0].final_pdf, { responseType: "arraybuffer" })).data
    );

    const signatureBuffer = Buffer.from(owner_signature.split(",")[1], "base64");

    const sign = await sharp(signatureBuffer).resize(220, 90).png().toBuffer();

    const meta = await sharp(baseImage).metadata();

    const final = await sharp(baseImage)
      .composite([
        {
          input: sign,
          top: meta.height - 200,
          left: meta.width - 300 // RIGHT
        }
      ])
      .png()
      .toBuffer();

    const upload = await cloudinary.uploader.upload(
      `data:image/png;base64,${final.toString("base64")}`
    );

    await db.query(
      "UPDATE agreements_form SET owner_signature=?, signed_pdf=?, agreement_status='owner_signed' WHERE booking_id=?",
      [owner_signature, upload.secure_url, booking_id]
    );

    res.json({ success: true, url: upload.secure_url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

/* ================= TENANT FINAL SIGN ================= */
exports.tenantFinalSign = async (req, res) => {
  try {
    const { booking_id, tenant_signature } = req.body;

    const [rows] = await db.query(
      "SELECT signed_pdf FROM agreements_form WHERE booking_id = ?",
      [booking_id]
    );

    const baseImage = Buffer.from(
      (await axios.get(rows[0].signed_pdf, { responseType: "arraybuffer" })).data
    );

    const signatureBuffer = Buffer.from(tenant_signature.split(",")[1], "base64");

    const sign = await sharp(signatureBuffer).resize(220, 90).png().toBuffer();

    const meta = await sharp(baseImage).metadata();

    const final = await sharp(baseImage)
      .composite([
        {
          input: sign,
          top: meta.height - 200,
          left: 80 // LEFT
        }
      ])
      .png()
      .toBuffer();

    const upload = await cloudinary.uploader.upload(
      `data:image/png;base64,${final.toString("base64")}`
    );

    await db.query(
      "UPDATE agreements_form SET signed_pdf=?, agreement_status='completed' WHERE booking_id=?",
      [upload.secure_url, booking_id]
    );

    res.json({ success: true, url: upload.secure_url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};