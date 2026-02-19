const db = require("../db");

exports.uploadOwnerDocs = async (req, res) => {
  try {
    const firebaseUid = req.user.uid;

    const [[user]] = await db.query(
      "SELECT id, owner_verification_status FROM users WHERE firebase_uid = ?",
      [firebaseUid]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // 🔒 First-time-only rule
    if (user.owner_verification_status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Owner already verified"
      });
    }

    const { id_proof_type } = req.body;

    const idProof = req.files?.id_proof?.[0];
    const propertyProof = req.files?.property_proof?.[0];
    const signature = req.files?.digital_signature?.[0];

    if (!idProof || !propertyProof || !signature) {
      return res.status(400).json({
        success: false,
        message: "All documents are required"
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
        `/uploads/verification/${idProof.filename}`,
        `/uploads/verification/${propertyProof.filename}`,
        `/uploads/verification/${signature.filename}`
      ]
    );

    await db.query(
      "UPDATE users SET owner_verification_status = 'pending' WHERE id = ?",
      [user.id]
    );

    res.json({
      success: true,
      message: "Documents uploaded. Waiting for admin approval"
    });

  } catch (err) {
    console.error("Owner verification error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
