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

/* ================= USER: GET AGREEMENT STATUS ================= */
exports.getAgreementByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    // Safety check for bookingId
    if (!bookingId || bookingId === "undefined") {
      return res.status(400).json({ success: false, message: "Invalid Booking ID" });
    }

    const [rows] = await db.query(
      "SELECT agreement_status, final_pdf, signed_pdf, full_name, email FROM agreements_form WHERE booking_id = ?",
      [bookingId]
    );

    if (rows && rows.length > 0) {
      return res.json({
        success: true,
        exists: true,
        data: rows[0]
      });
    }

    // This is the CRITICAL fix: Return 200 with exists: false instead of crashing
    return res.json({ success: true, exists: false });
    
  } catch (error) {
    console.error("Error in getAgreementByBookingId:", error);
    res.status(500).json({ success: false, message: "Internal Server Error checking status" });
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

    const toSafeInt = (val) => {
        const parsed = parseInt(val);
        return isNaN(parsed) ? 0 : parsed;
    };

    const sql = `
      INSERT INTO agreements_form (
        user_id, booking_id, full_name, father_name, mobile, email,
        address, city, state, pincode, aadhaar_last4, pan_number,
        checkin_date, agreement_months, rent, deposit, maintenance,
        signature, aadhaar_front, aadhaar_back, pan_card, agreement_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `;

    const values = [
      toSafeInt(user_id), toSafeInt(booking_id), full_name, father_name || null,
      mobile, email || null, address, city || null, state || null, pincode || null,
      aadhaar_last4, pan_number || null, checkin_date, toSafeInt(agreement_months),
      toSafeInt(rent), toSafeInt(deposit), toSafeInt(maintenance),
      signature, aadhaar_front, aadhaar_back, pan_card
    ];

    const [result] = await db.query(sql, values);
    return { insertId: result.insertId };
  } catch (error) {
    console.error("Submission Error:", error);
    throw error;
  }
};

/* ================= OWNER & TENANT SIGNING LOGIC ================= */
exports.signOwnerAgreement = async (req, res) => {
  try {
    const { booking_id, owner_mobile, owner_signature, accepted_terms } = req.body;
    if (!accepted_terms || !owner_signature) {
      return res.status(400).json({ message: "Signature and terms acceptance required" });
    }

    const [rows] = await db.query("SELECT final_pdf FROM agreements_form WHERE booking_id = ?", [booking_id]);
    if (!rows[0]?.final_pdf) return res.status(404).json({ message: "Draft PDF not found" });

    const response = await axios.get(rows[0].final_pdf, { responseType: "arraybuffer" });
    const baseImage = Buffer.from(response.data);
    const metadata = await sharp(baseImage).metadata();

    const sigBuffer = Buffer.from(owner_signature.split(",")[1], "base64");
    const resizedSig = await sharp(sigBuffer).resize(220, 90).png().toBuffer();

    const now = new Date();
    const istDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short" }).format(now);
    const istTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", timeStyle: "medium" }).format(now);

    const svgText = `
    <svg width="300" height="150">
      <text x="0" y="20" font-family="Arial" font-size="14" fill="black">Digitally Signed by Owner</text>
      <text x="0" y="40" font-family="Arial" font-size="12" fill="gray">Mob: ${owner_mobile}</text>
      <text x="0" y="60" font-family="Arial" font-size="12" fill="gray">Date: ${istDate} ${istTime}</text>
    </svg>`;

    const finalImage = await sharp(baseImage)
      .composite([
        { input: Buffer.from(svgText), top: metadata.height - 240, left: metadata.width - 320 },
        { input: resizedSig, top: metadata.height - 180, left: metadata.width - 320 }
      ])
      .png().toBuffer();

    const upload = await cloudinary.uploader.upload(`data:image/png;base64,${finalImage.toString("base64")}`, {
      folder: "signed_agreements"
    });

    await db.query(`
      UPDATE agreements_form 
      SET signed_pdf = ?, agreement_status = 'approved', owner_signed_at = NOW() 
      WHERE booking_id = ?`, 
      [upload.secure_url, booking_id]
    );

    res.json({ success: true, signed_pdf: upload.secure_url });
  } catch (err) {
    console.error("Owner Signing Error:", err);
    res.status(500).json({ message: "Owner signing failed" });
  }
};

exports.tenantFinalSign = async (req, res) => {
  try {
    const { booking_id, tenant_signature } = req.body;

    const [rows] = await db.query("SELECT signed_pdf FROM agreements_form WHERE booking_id = ?", [booking_id]);
    const ownerSignedUrl = rows[0]?.signed_pdf;

    if (!ownerSignedUrl) return res.status(400).json({ message: "Wait for owner signature" });

    const response = await axios.get(ownerSignedUrl, { responseType: "arraybuffer" });
    const baseImage = Buffer.from(response.data);
    const metadata = await sharp(baseImage).metadata();

    const sigBuffer = Buffer.from(tenant_signature.split(",")[1], "base64");
    const resizedSig = await sharp(sigBuffer).resize(220, 90).png().toBuffer();

    const finalImage = await sharp(baseImage)
      .composite([{
        input: resizedSig,
        top: metadata.height - 180,
        left: 80 
      }])
      .png().toBuffer();

    const upload = await cloudinary.uploader.upload(`data:image/png;base64,${finalImage.toString("base64")}`, {
      folder: "signed_agreements"
    });

    await db.query(
      "UPDATE agreements_form SET signed_pdf=?, agreement_status='completed' WHERE booking_id=?",
      [upload.secure_url, booking_id]
    );

    res.json({ success: true, url: upload.secure_url });
  } catch (err) {
    console.error("Tenant Signing Error:", err);
    res.status(500).json({ message: "Tenant signing failed" });
  }
};

/* ================= ADMIN STUBS ================= */
exports.getAllAgreements = async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM agreements_form ORDER BY created_at DESC");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch agreements" });
    }
};

exports.getAgreementById = async (req, res) => { /* Logic here */ };
exports.updateAgreementStatus = async (req, res) => { /* Logic here */ };
exports.uploadFinalImage = async (req, res) => { /* Logic here */ };