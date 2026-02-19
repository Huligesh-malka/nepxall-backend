// controllers/ownerVerificationController.js
const db = require("../db");

exports.uploadOwnerDocs = async (req, res) => {
  try {
    const ownerFirebaseUid = req.user.uid;

    const [[user]] = await db.query(
      "SELECT id, owner_verification_status FROM users WHERE firebase_uid = ?",
      [ownerFirebaseUid]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.owner_verification_status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Documents already verified"
      });
    }

    const {
      id_proof_type
    } = req.body;

    const idProof = req.files.id_proof?.[0];
    const propertyProof = req.files.property_proof?.[0];
    const signature = req.files.digital_signature?.[0];

    if (!idProof || !propertyProof || !signature) {
      return res.status(400).json({
        success: false,
        message: "All documents required"
      });
    }

    await db.query(
      `INSERT INTO owner_verifications 
       (owner_id, id_proof_type, id_proof_file, property_proof_file, digital_signature_file)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         id_proof_type = VALUES(id_proof_type),
         id_proof_file = VALUES(id_proof_file),
         property_proof_file = VALUES(property_proof_file),
         digital_signature_file = VALUES(digital_signature_file),
         status = 'pending',
         rejection_reason = NULL`,
      [
        user.id,
        id_proof_type,
        `/uploads/owner-docs/${idProof.filename}`,
        `/uploads/owner-docs/${propertyProof.filename}`,
        `/uploads/owner-docs/${signature.filename}`
      ]
    );

    await db.query(
      "UPDATE users SET owner_verification_status = 'pending' WHERE id = ?",
      [user.id]
    );

    res.json({ success: true, message: "Documents uploaded for verification" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};


// GET /api/owner/verification/status
exports.getOwnerVerificationStatus = async (req, res) => {
  const firebaseUid = req.user.uid;

  const [[user]] = await db.query(
    "SELECT owner_verification_status FROM users WHERE firebase_uid = ?",
    [firebaseUid]
  );

  res.json({ status: user.owner_verification_status });
};



// GET verification status for owner
exports.getVerificationStatus = async (req, res) => {
  try {
    const firebaseUid = req.user.uid;

    const [[user]] = await db.query(
      "SELECT id, owner_verification_status FROM users WHERE firebase_uid = ?",
      [firebaseUid]
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let rejection_reason = null;

    if (user.owner_verification_status === "rejected") {
      const [[row]] = await db.query(
        "SELECT rejection_reason FROM owner_verifications WHERE owner_id = ?",
        [user.id]
      );
      rejection_reason = row?.rejection_reason || null;
    }

    res.json({
      status: user.owner_verification_status, // pending | verified | rejected
      rejection_reason
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
