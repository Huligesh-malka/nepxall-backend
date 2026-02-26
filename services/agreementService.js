const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

exports.generateAgreementPDF = async ({
  booking,
  owner,
  user,
  pg,
  ownerSignaturePath = null,
}) => {
  try {
    //////////////////////////////////////////////////////
    // 📁 ENSURE AGREEMENT FOLDER EXISTS
    //////////////////////////////////////////////////////
    const uploadDir = path.join(__dirname, "..", "uploads", "agreements");

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    //////////////////////////////////////////////////////
    // 📄 FILE NAME
    //////////////////////////////////////////////////////
    const fileName = `agreement_${booking.id}.pdf`;
    const filePath = path.join(uploadDir, fileName);

    //////////////////////////////////////////////////////
    // 🛡 SAFE OWNER SIGNATURE PATH
    //////////////////////////////////////////////////////
    let signatureFullPath = null;
    let signatureForDB = null;

    if (ownerSignaturePath && typeof ownerSignaturePath === "string") {
      const tempPath = path.join(
        __dirname,
        "..",
        "uploads",
        ownerSignaturePath
      );

      if (fs.existsSync(tempPath)) {
        signatureFullPath = tempPath;
        signatureForDB = ownerSignaturePath;
      }
    }

    //////////////////////////////////////////////////////
    // 🧠 PROPERTY TYPE BASED TEXT (PG / CO-LIVING / TO-LET)
    //////////////////////////////////////////////////////
    let propertyLabel = "PG Stay";

    if (pg.property_type === "coliving") propertyLabel = "Co-Living Stay";
    if (pg.property_type === "tolet") propertyLabel = "Rental House";

    //////////////////////////////////////////////////////
    // 📄 AGREEMENT CONTENT (DEMO TEXT → replace with real PDF later)
    //////////////////////////////////////////////////////
    const content = `
==============================
        RENT AGREEMENT
==============================

Property Type : ${propertyLabel}

Tenant Name   : ${user?.name || "N/A"}
Tenant Phone  : ${user?.phone || "N/A"}

Property Name : ${pg?.pg_name || "N/A"}
Address       : ${pg?.address || "N/A"}

Owner Name    : ${owner?.name || "N/A"}

Check-in Date : ${booking?.check_in_date || "N/A"}
Room Type     : ${booking?.room_type || "N/A"}

Agreement ID  : ${booking?.id}

==============================
NepXall – Smart Living
==============================
`;

    //////////////////////////////////////////////////////
    // 💾 WRITE FILE
    //////////////////////////////////////////////////////
    fs.writeFileSync(filePath, content);

    //////////////////////////////////////////////////////
    // 🔐 GENERATE HASH
    //////////////////////////////////////////////////////
    const hash = crypto
      .createHash("sha256")
      .update(content)
      .digest("hex");

    //////////////////////////////////////////////////////
    // ✅ RETURN FOR DB SAVE
    //////////////////////////////////////////////////////
    return {
      agreement_file: `/uploads/agreements/${fileName}`,
      agreement_hash: hash,
      owner_signature_file: signatureForDB, // only relative path
    };
  } catch (err) {
    console.error("❌ AGREEMENT GENERATION ERROR:", err);
    throw err;
  }
};