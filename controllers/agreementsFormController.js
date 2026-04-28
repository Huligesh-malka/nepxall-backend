const db = require("../db");
const cloudinary = require("cloudinary").v2;
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const axios = require("axios");
const sendNotification = require("../utils/sendNotification"); // ✅ ADDED

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= PRE-OTP VERIFICATION (USING USERS TABLE) ================= */
exports.verifyTenantForBooking = async (req, res) => {
  const { booking_id, mobile } = req.body;
  
  if (!booking_id || !mobile) {
    return res.status(400).json({ success: false, message: "Booking ID and Mobile are required" });
  }

  try {
    const [rows] = await db.query(
      `SELECT u.phone, u.fcm_token, u.id as user_id, b.owner_id
       FROM agreements_form af
       JOIN users u ON af.user_id = u.id
       JOIN bookings b ON b.id = af.booking_id
       WHERE af.booking_id = ?`,
      [booking_id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "No record found for this booking or user." });
    }

    const registeredPhone = rows[0].phone.replace(/\D/g, '');
    const inputMobile = mobile.replace(/\D/g, '');
    const isMatch = registeredPhone.endsWith(inputMobile) && inputMobile.length >= 10;

    if (isMatch) {
      return res.json({ 
        success: true, 
        message: "Mobile verified against registered account. Proceed with OTP." 
      });
    } else {
      return res.status(403).json({ 
        success: false, 
        message: "Access Denied. This number does not match your registered account phone." 
      });
    }
  } catch (err) {
    console.error("Verification Error:", err);
    res.status(500).json({ success: false, message: "Internal Server Error during verification" });
  }
};

exports.tenantFinalSign = async (req, res) => {
  try {
    const { booking_id, tenant_signature, tenant_mobile } = req.body;

    // IP + device
    const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const device_info = req.headers['user-agent'];

    // 1. Get signed PDF (owner already signed) and user details
    const [rows] = await db.query(
      `SELECT af.signed_pdf, u.phone, u.id as user_id, u.name as user_name, 
              b.owner_id, b.pg_id
       FROM agreements_form af
       JOIN users u ON af.user_id = u.id
       JOIN bookings b ON b.id = af.booking_id
       WHERE af.booking_id = ?`,
      [booking_id]
    );

    const data = rows[0];

    if (!data?.signed_pdf) {
      return res.status(400).json({ message: "Owner has not signed yet" });
    }

    // mobile verify
    const dbPhone = data.phone.replace(/\D/g, '');
    const inputMobile = tenant_mobile.replace(/\D/g, '');

    if (!dbPhone.endsWith(inputMobile)) {
      return res.status(403).json({ message: "Mobile mismatch" });
    }

    // 2. Download existing signed PDF
    const pdfBytes = await axios.get(data.signed_pdf, {
      responseType: "arraybuffer"
    });

    // 3. Load PDF
    const pdfDoc = await PDFDocument.load(pdfBytes.data);
    const pages = pdfDoc.getPages();
    const page = pages[pages.length - 1];

    const { width } = page.getSize();

    // 4. Signature image
    const base64Data = tenant_signature.replace(/^data:image\/\w+;base64,/, "");
    const sigBuffer = Buffer.from(base64Data, "base64");

    const pngImage = await pdfDoc.embedPng(sigBuffer);

    // 5. Font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // LEFT SIDE POSITION
    const leftX = 60;

    // Signature
    page.drawImage(pngImage, {
      x: leftX,
      y: 80,
      width: 150,
      height: 50,
    });

    // Date
    const date = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // Text block
    page.drawText("Digitally Signed by Tenant", {
      x: leftX,
      y: 150,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });

    page.drawText(`Mobile: ${tenant_mobile}`, {
      x: leftX,
      y: 135,
      size: 9,
      font,
    });

    page.drawText(`Date: ${date}`, {
      x: leftX,
      y: 120,
      size: 9,
      font,
    });

    page.drawText("Auth: OTP Verified", {
      x: leftX,
      y: 105,
      size: 9,
      font,
    });

    // 7. Save PDF
    const finalPdfBytes = await pdfDoc.save();

    // 8. Upload final PDF (owner + tenant)
    const upload = await cloudinary.uploader.upload(
      `data:application/pdf;base64,${Buffer.from(finalPdfBytes).toString("base64")}`,
      {
        resource_type: "raw",
        folder: "signed_agreements",
        format: "pdf"
      }
    );

    // 9. Update DB
    await db.query(
      `UPDATE agreements_form 
       SET agreement_status = 'completed',
           tenant_final_signature = ?, 
           tenant_mobile = ?,
           tenant_ip_address = ?,
           tenant_device_info = ?,
           signed_pdf = ?
       WHERE booking_id = ?`,
      [tenant_signature, tenant_mobile, ip_address, device_info, upload.secure_url, booking_id]
    );

    // Get PG name for notification
    const [[pgInfo]] = await db.query(
      "SELECT pg_name FROM pgs WHERE id = ?",
      [data.pg_id]
    );

    //////////////////////////////////////////////////////
    // 🔔 SEND NOTIFICATION TO OWNER
    //////////////////////////////////////////////////////
    const [[owner]] = await db.query(
      "SELECT fcm_token FROM users WHERE id = ?",
      [data.owner_id]
    );

    if (owner?.fcm_token) {
      await sendNotification(
        owner.fcm_token,
        "Tenant Signed Agreement 📄",
        `${data.user_name || "Tenant"} has signed the agreement for ${pgInfo?.pg_name || "PG"}.`
      );
    }

    // Insert in-app notification for owner
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        data.owner_id,
        "Tenant Signed Agreement 📄",
        `${data.user_name || "Tenant"} has signed the agreement for ${pgInfo?.pg_name || "PG"}.`,
        "tenant_signed"
      ]
    );

    //////////////////////////////////////////////////////
    // 🔔 SEND NOTIFICATION TO TENANT (confirmation)
    //////////////////////////////////////////////////////
    const [[tenant]] = await db.query(
      "SELECT fcm_token FROM users WHERE id = ?",
      [data.user_id]
    );

    if (tenant?.fcm_token) {
      await sendNotification(
        tenant.fcm_token,
        "Agreement Completed ✅",
        `Your agreement for ${pgInfo?.pg_name || "PG"} has been fully signed and completed.`
      );
    }

    // Insert in-app notification for tenant
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        data.user_id,
        "Agreement Completed ✅",
        `Your agreement for ${pgInfo?.pg_name || "PG"} has been fully signed and completed.`,
        "agreement_completed"
      ]
    );

    res.json({
      success: true,
      message: "Tenant signed successfully",
      signed_pdf: upload.secure_url,
      notifications_sent: {
        owner: !!owner?.fcm_token,
        tenant: !!tenant?.fcm_token
      }
    });

  } catch (err) {
    console.error("🔥 Tenant PDF SIGN ERROR:", err);
    res.status(500).json({ success: false, message: "Tenant signing failed" });
  }
};

/* ================= USER: GET STATUS ================= */
exports.getAgreementByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const [rows] = await db.query(
      `SELECT af.*, u.phone as registered_phone 
       FROM agreements_form af
       JOIN users u ON af.user_id = u.id
       WHERE af.booking_id = ?`,
      [bookingId]
    );
    if (rows && rows.length > 0) return res.json({ success: true, exists: true, data: rows[0] });
    return res.json({ success: true, exists: false });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/* ================= USER: SUBMIT FORM ================= */
exports.submitAgreementForm = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const { 
      user_id, booking_id, full_name, father_name, mobile, email, address, 
      city, state, pincode, aadhaar_last4, pan_number, checkin_date, 
      agreement_months, rent, deposit, maintenance 
    } = req.body;
    
    const files = req.files || {};
    const toSafeInt = (v) => isNaN(parseInt(v)) ? 0 : parseInt(v);

    // Get booking details for notification
    const [[booking]] = await connection.query(
      `SELECT b.owner_id, b.pg_id, p.pg_name 
       FROM bookings b
       JOIN pgs p ON p.id = b.pg_id
       WHERE b.id = ?`,
      [booking_id]
    );

    if (!booking) {
      throw new Error("Booking not found");
    }

    const sql = `INSERT INTO agreements_form 
      (user_id, booking_id, full_name, father_name, mobile, email, address, 
       city, state, pincode, aadhaar_last4, pan_number, checkin_date, 
       agreement_months, rent, deposit, maintenance, signature, aadhaar_front, 
       aadhaar_back, pan_card, agreement_status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`;
    
    const values = [
      toSafeInt(user_id), toSafeInt(booking_id), full_name, father_name, mobile, 
      email, address, city, state, pincode, aadhaar_last4, pan_number, checkin_date, 
      toSafeInt(agreement_months), toSafeInt(rent), toSafeInt(deposit), toSafeInt(maintenance), 
      files["signature"]?.[0]?.path, files["aadhaar_front"]?.[0]?.path, 
      files["aadhaar_back"]?.[0]?.path, files["pan_card"]?.[0]?.path
    ];

    const [result] = await connection.query(sql, values);

    await connection.commit();

    //////////////////////////////////////////////////////
    // 🔔 SEND NOTIFICATION TO OWNER
    //////////////////////////////////////////////////////
    const [[owner]] = await db.query(
      "SELECT fcm_token FROM users WHERE id = ?",
      [booking.owner_id]
    );

    if (owner?.fcm_token) {
      await sendNotification(
        owner.fcm_token,
        "New Agreement Form 📋",
        `${full_name} has submitted agreement form for ${booking.pg_name || "PG"}.`
      );
    }

    // Insert in-app notification for owner
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        booking.owner_id,
        "New Agreement Form 📋",
        `${full_name} has submitted agreement form for ${booking.pg_name || "PG"}.`,
        "agreement_submitted"
      ]
    );

    res.json({ 
      success: true, 
      message: "Agreement form submitted successfully", 
      insertId: result.insertId 
    });

  } catch (error) {
    await connection.rollback();
    console.error("Submit agreement error:", error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};

/* ================= ADMIN LOGIC ================= */
exports.getAllAgreements = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT af.*, 
             b.pg_id, 
             p.pg_name,
             u.name as user_name,
             u.phone as user_phone
      FROM agreements_form af
      LEFT JOIN bookings b ON b.id = af.booking_id
      LEFT JOIN pgs p ON p.id = b.pg_id
      LEFT JOIN users u ON u.id = af.user_id
      ORDER BY af.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Get all agreements error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch agreements" });
  }
};

exports.getAgreementById = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT af.*, b.pg_id, p.pg_name
      FROM agreements_form af
      LEFT JOIN bookings b ON b.id = af.booking_id
      LEFT JOIN pgs p ON p.id = b.pg_id
      WHERE af.id = ?
    `, [req.params.id]);
    
    if (rows.length === 0) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Get agreement by id error:", error);
    res.status(500).json({ success: false, message: "Error fetching details" });
  }
};

exports.updateAgreementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Get user details for notification
    const [[agreement]] = await db.query(
      `SELECT af.user_id, b.pg_id, p.pg_name
       FROM agreements_form af
       JOIN bookings b ON b.id = af.booking_id
       JOIN pgs p ON p.id = b.pg_id
       WHERE af.id = ?`,
      [id]
    );

    await db.query(
      "UPDATE agreements_form SET agreement_status = ? WHERE id = ?", 
      [status, id]
    );

    //////////////////////////////////////////////////////
    // 🔔 SEND NOTIFICATION TO USER
    //////////////////////////////////////////////////////
    if (agreement && agreement.user_id) {
      const [[user]] = await db.query(
        "SELECT fcm_token FROM users WHERE id = ?",
        [agreement.user_id]
      );

      let title = "";
      let message = "";

      if (status === "approved") {
        title = "Agreement Approved ✅";
        message = `Your agreement for ${agreement.pg_name || "PG"} has been approved.`;
      } else if (status === "rejected") {
        title = "Agreement Update ❌";
        message = `Your agreement for ${agreement.pg_name || "PG"} requires changes. Please contact support.`;
      }

      if (user?.fcm_token && title) {
        await sendNotification(user.fcm_token, title, message);
      }

      if (title) {
        await db.query(
          `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
           VALUES (?, ?, ?, ?, 0, NOW())`,
          [agreement.user_id, title, message, "agreement_status"]
        );
      }
    }

    res.json({ success: true, message: "Status updated" });
  } catch (error) {
    console.error("Update agreement status error:", error);
    res.status(500).json({ success: false, message: "Update failed" });
  }
};

exports.uploadFinalImage = async (req, res) => {
  try {
    const { id } = req.params;
    const final_image_path = req.file?.path;
    
    if (!final_image_path) return res.status(400).json({ success: false, message: "No file uploaded" });

    // Get agreement details for notification
    const [[agreement]] = await db.query(
      `SELECT af.user_id, b.pg_id, p.pg_name
       FROM agreements_form af
       JOIN bookings b ON b.id = af.booking_id
       JOIN pgs p ON p.id = b.pg_id
       WHERE af.id = ?`,
      [id]
    );

    await db.query(
      "UPDATE agreements_form SET final_pdf = ?, signed_pdf = NULL, owner_signed_at = NULL, agreement_status = 'approved' WHERE id = ?", 
      [final_image_path, id]
    );

    //////////////////////////////////////////////////////
    // 🔔 SEND NOTIFICATION TO USER
    //////////////////////////////////////////////////////
    if (agreement && agreement.user_id) {
      const [[user]] = await db.query(
        "SELECT fcm_token FROM users WHERE id = ?",
        [agreement.user_id]
      );

      if (user?.fcm_token) {
        await sendNotification(
          user.fcm_token,
          "Agreement Ready for Sign 📄",
          `Your agreement for ${agreement.pg_name || "PG"} is ready for signing.`
        );
      }

      await db.query(
        `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
         VALUES (?, ?, ?, ?, 0, NOW())`,
        [
          agreement.user_id,
          "Agreement Ready for Sign 📄",
          `Your agreement for ${agreement.pg_name || "PG"} is ready for signing.`,
          "agreement_ready"
        ]
      );
    }

    res.json({ success: true, message: "Document re-uploaded. Workflow reset." });
  } catch (error) {
    console.error("Upload final image error:", error);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
};

exports.deleteAgreement = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query("DELETE FROM agreements_form WHERE id = ?", [id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, message: "Agreement deleted" });
  } catch (error) {
    console.error("Delete agreement error:", error);
    res.status(500).json({ success: false, message: "Delete failed" });
  }
};

exports.getUserAgreements = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.query(`
      SELECT 
        af.booking_id,
        af.signed_pdf,
        af.agreement_status,
        af.created_at,
        COALESCE(p.pg_name, 'PG') AS pg_name,
        af.rent,
        af.deposit,
        af.maintenance,
        af.checkin_date
      FROM agreements_form af
           LEFT JOIN pgs p ON b.pg_id = p.id
      WHERE af.user_id = ?
      AND af.agreement_status = 'completed'
      ORDER BY af.created_at DESC
    `, [userId]);

    res.json({ success: true, data: rows });

  } catch (err) {
    console.error("🔥 Get Agreements Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= ADMIN: GENERATE AGREEMENT PDF ================= */
exports.generateAgreementPDF = async (req, res) => {
  try {
    const { booking_id } = req.body;

    // Get all data for agreement
    const [[agreement]] = await db.query(`
      SELECT 
        af.*,
        b.pg_id,
        b.rent_amount,
        b.security_deposit,
        b.maintenance_amount,
        b.check_in_date,
        b.room_type,
        p.pg_name,
        p.address,
        p.city,
        p.contact_person,
        p.contact_phone,
        u.name as owner_name,
        u.phone as owner_phone
      FROM agreements_form af
      JOIN bookings b ON b.id = af.booking_id
      JOIN pgs p ON p.id = b.pg_id
      JOIN users u ON u.id = b.owner_id
      WHERE af.booking_id = ?
    `, [booking_id]);

    if (!agreement) {
      return res.status(404).json({ success: false, message: "Agreement not found" });
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const { height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 50;

    // Title
    page.drawText("RENTAL AGREEMENT", {
      x: 200,
      y: y,
      size: 18,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    y -= 40;

    // Agreement content
    const content = [
      `This Rental Agreement is made on ${new Date().toLocaleDateString()} between:`,
      "",
      `1. OWNER: ${agreement.owner_name}, Mobile: ${agreement.owner_phone}`,
      "",
      `2. TENANT: ${agreement.full_name}, Mobile: ${agreement.mobile}`,
      "",
      `PG DETAILS:`,
      `Name: ${agreement.pg_name}`,
      `Address: ${agreement.address}, ${agreement.city}`,
      `Room Type: ${agreement.room_type}`,
      "",
      `AGREEMENT TERMS:`,
      `Monthly Rent: ₹${agreement.rent_amount}`,
      `Security Deposit: ₹${agreement.security_deposit}`,
      `Maintenance Charges: ₹${agreement.maintenance_amount}`,
      `Check-in Date: ${new Date(agreement.check_in_date).toLocaleDateString()}`,
      `Agreement Period: ${agreement.agreement_months} months`,
      "",
      `TENANT DETAILS:`,
      `Full Name: ${agreement.full_name}`,
      `Father's Name: ${agreement.father_name}`,
      `Mobile: ${agreement.mobile}`,
      `Email: ${agreement.email || 'N/A'}`,
      `Address: ${agreement.address}`,
      `City: ${agreement.city}`,
      `State: ${agreement.state}`,
      `Pincode: ${agreement.pincode}`,
      `Aadhaar (Last 4): ${agreement.aadhaar_last4}`,
      `PAN Number: ${agreement.pan_number || 'N/A'}`,
      "",
      `TERMS AND CONDITIONS:`,
      `1. The tenant agrees to pay rent on or before the 5th of every month.`,
      `2. Security deposit is refundable at the time of vacating, subject to deductions.`,
      `3. The tenant shall maintain the property in good condition.`,
      `4. The owner has right to inspect the property with prior notice.`,
      `5. Notice period of 30 days is required for vacating.`,
      `6. Subletting is strictly prohibited without owner's consent.`,
      `7. The tenant must follow all PG rules and regulations.`,
      `8. Any damage to property will be deducted from security deposit.`,
      "",
      `This agreement is legally binding and both parties agree to the terms above.`
    ];

    for (const line of content) {
      if (y < 50) {
        // Add new page if needed
        const newPage = pdfDoc.addPage([600, 800]);
        y = height - 50;
      }
      
      page.drawText(line, {
        x: 50,
        y: y,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      y -= 20;
    }

    // Save PDF
    const pdfBytes = await pdfDoc.save();

    // Upload to Cloudinary
    const upload = await cloudinary.uploader.upload(
      `data:application/pdf;base64,${Buffer.from(pdfBytes).toString("base64")}`,
      {
        resource_type: "raw",
        folder: "agreements",
        format: "pdf"
      }
    );

    // Update database
    await db.query(
      `UPDATE agreements_form 
       SET final_pdf = ?, agreement_status = 'approved'
       WHERE booking_id = ?`,
      [upload.secure_url, booking_id]
    );

    //////////////////////////////////////////////////////
    // 🔔 SEND NOTIFICATION TO OWNER
    //////////////////////////////////////////////////////
    const [[owner]] = await db.query(
      "SELECT fcm_token FROM users WHERE id = ?",
      [agreement.owner_id]
    );

    if (owner?.fcm_token) {
      await sendNotification(
        owner.fcm_token,
        "Agreement Ready for Sign 📄",
        `Agreement for ${agreement.pg_name} is ready. Please review and sign.`
      );
    }

    // Insert in-app notification for owner
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        agreement.owner_id,
        "Agreement Ready for Sign 📄",
        `Agreement for ${agreement.pg_name} is ready. Please review and sign.`,
        "agreement_generated"
      ]
    );

    res.json({
      success: true,
      message: "Agreement PDF generated successfully",
      pdf_url: upload.secure_url
    });

  } catch (err) {
    console.error("Generate PDF Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= GET AGREEMENT STATUS SUMMARY ================= */
exports.getAgreementSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.query(`
      SELECT 
        COUNT(*) as total_agreements,
        SUM(CASE WHEN agreement_status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN agreement_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN agreement_status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN agreement_status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM agreements_form af
      JOIN bookings b ON b.id = af.booking_id
      WHERE af.user_id = ?
    `, [userId]);

    res.json({
      success: true,
      data: rows[0]
    });

  } catch (err) {
    console.error("Get agreement summary error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= CHECK AGREEMENT SIGNING STATUS ================= */
exports.checkSigningStatus = async (req, res) => {
  try {
    const { booking_id } = req.params;

    const [[agreement]] = await db.query(`
      SELECT 
        id,
        agreement_status,
        owner_signed_at,
        tenant_final_signature,
        signed_pdf,
        final_pdf
      FROM agreements_form
      WHERE booking_id = ?
    `, [booking_id]);

    if (!agreement) {
      return res.status(404).json({ success: false, message: "Agreement not found" });
    }

    const status = {
      is_completed: agreement.agreement_status === 'completed',
      owner_signed: !!agreement.owner_signed_at,
      tenant_signed: !!agreement.tenant_final_signature,
      has_signed_pdf: !!agreement.signed_pdf,
      has_final_pdf: !!agreement.final_pdf,
      current_status: agreement.agreement_status,
      signed_pdf_url: agreement.signed_pdf || null,
      final_pdf_url: agreement.final_pdf || null
    };

    res.json({
      success: true,
      data: status
    });

  } catch (err) {
    console.error("Check signing status error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};