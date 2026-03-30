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
    if (!bookingId || bookingId === "undefined") {
      return res.status(400).json({ success: false, message: "Invalid Booking ID" });
    }

    const [rows] = await db.query(
      "SELECT agreement_status, final_pdf, signed_pdf, full_name, mobile, email FROM agreements_form WHERE booking_id = ?",
      [bookingId]
    );

    if (rows && rows.length > 0) {
      return res.json({ success: true, exists: true, data: rows[0] });
    }
    return res.json({ success: true, exists: false });
  } catch (error) {
    console.error("Error in getAgreementByBookingId:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/* ================= USER: SUBMIT INITIAL FORM ================= */
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

/* ================= OWNER SIGNING LOGIC ================= */
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
<svg width="600" height="200">
  <text x="0" y="20" font-size="16">Digitally Signed</text>
  <text x="0" y="45" font-size="14">Mobile: ${tenant_mobile}</text>
  <text x="0" y="70" font-size="14">Date: ${istDate}</text>
  <text x="0" y="95" font-size="14">Time: ${istTime}</text>
  <text x="0" y="120" font-size="12">Location: ${data.city || ""}, ${data.state || ""}</text>
</svg>
`;

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

/* ================= TENANT FINAL SIGNING (NAME REMOVED) ================= */
exports.tenantFinalSign = async (req, res) => {
  try {
    const { booking_id, tenant_signature, tenant_mobile } = req.body;

    if (!tenant_signature || !booking_id) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // 1. Fetch agreement (owner already signed)
    const [rows] = await db.query(
      `SELECT signed_pdf, city, state FROM agreements_form WHERE booking_id = ?`,
      [booking_id]
    );

    const data = rows[0];
    if (!data) return res.status(404).json({ message: "Agreement record not found" });

    const ownerSignedUrl = data.signed_pdf;
    if (!ownerSignedUrl) {
      return res.status(400).json({ message: "Owner has not signed this document yet." });
    }

    // 2. Fetch image
    const response = await axios({
      url: ownerSignedUrl,
      method: "GET",
      responseType: "arraybuffer",
    });

    const baseImage = Buffer.from(response.data);
    const metadata = await sharp(baseImage).metadata();

    // 3. Process signature
    const base64Data = tenant_signature.includes(",")
      ? tenant_signature.split(",")[1]
      : tenant_signature;

    const sigBuffer = Buffer.from(base64Data, "base64");

    const resizedSig = await sharp(sigBuffer)
      .resize(180, 70) // smaller clean signature
      .png()
      .toBuffer();

    // 4. Time
    const now = new Date();
    const istDate = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "short",
    }).format(now);

    const istTime = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      timeStyle: "medium",
    }).format(now);

    // 5. Clean SVG (NO BOLD + PROPER FORMAT)
    const svgText = `
    <svg width="350" height="160">
      <text x="0" y="18" font-family="Arial" font-size="13" fill="black">Digitally Signed by Tenant</text>
      <text x="0" y="38" font-family="Arial" font-size="11" fill="#444">Mobile: ${tenant_mobile}</text>
      <text x="0" y="55" font-family="Arial" font-size="11" fill="#444">Location: ${data.city || ""}, ${data.state || ""}</text>
      <text x="0" y="72" font-family="Arial" font-size="11" fill="#444">Date: ${istDate} ${istTime}</text>
    </svg>`;

    // 6. POSITION LIKE OWNER (LEFT SIDE MIRROR)
const x = 80; // left side (same margin)
const y = metadata.height - 200; // SAME as owner

const textBuffer = Buffer.from(svgText);

const finalImageBuffer = await sharp(baseImage)
  .composite([
    {
      input: textBuffer,
      top: y - 140, // text above (same as owner logic)
      left: x
    },
    {
      input: resizedSig,
      top: y, // signature below
      left: x
    }
  ])
  .png()
  .toBuffer();
    // 7. Upload
    const upload = await cloudinary.uploader.upload(
      `data:image/png;base64,${finalImageBuffer.toString("base64")}`,
      { folder: "signed_agreements" }
    );

    // 8. Save
    await db.query(
      `UPDATE agreements_form 
       SET signed_pdf = ?, agreement_status = 'completed', mobile = ? 
       WHERE booking_id = ?`,
      [upload.secure_url, tenant_mobile, booking_id]
    );

    res.json({ success: true, url: upload.secure_url });

  } catch (err) {
    console.error("🔥 Tenant Signing Error:", err);
    res.status(500).json({ success: false, message: "Server Error during signing" });
  }
};

/* ================= ADMIN LOGIC ================= */
exports.getAllAgreements = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM agreements_form ORDER BY created_at DESC");
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch agreements" });
  }
};

exports.getAgreementById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query("SELECT * FROM agreements_form WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching details" });
  }
};

exports.updateAgreementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await db.query("UPDATE agreements_form SET agreement_status = ? WHERE id = ?", [status, id]);
    res.json({ success: true, message: "Status updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Update failed" });
  }
};

exports.uploadFinalImage = async (req, res) => {
  try {
    const { id } = req.params;
    const final_image_path = req.file?.path;
    if (!final_image_path) return res.status(400).json({ success: false, message: "No file" });

    await db.query(
      "UPDATE agreements_form SET final_pdf = ?, agreement_status = 'approved' WHERE id = ?", 
      [final_image_path, id]
    );
    res.json({ success: true, message: "Image uploaded and status approved" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Upload failed" });
  }
};