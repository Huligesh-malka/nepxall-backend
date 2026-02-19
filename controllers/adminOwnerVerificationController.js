const db = require("../db");

// ✅ Get all owner verification requests
exports.getAllOwnerVerifications = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        ov.id,
        ov.owner_id,
        u.name,
        u.email,
        u.phone,
        ov.id_proof_type,
        ov.id_proof_file,
        ov.property_proof_file,
        ov.digital_signature_file,
        ov.status,
        ov.rejection_reason,
        ov.created_at
      FROM owner_verifications ov
      JOIN users u ON u.id = ov.owner_id
      ORDER BY ov.created_at DESC
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Approve owner documents
exports.approveOwnerVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    await db.query(
      `UPDATE owner_verifications 
       SET status='approved', verified_by=?, verified_at=NOW()
       WHERE id=?`,
      [adminId, id]
    );

    await db.query(
      `UPDATE users 
       SET owner_verification_status='verified'
       WHERE id = (SELECT owner_id FROM owner_verifications WHERE id=?)`,
      [id]
    );

    res.json({ success: true, message: "Owner verified" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ❌ Reject owner documents
exports.rejectOwnerVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await db.query(
      `UPDATE owner_verifications 
       SET status='rejected', rejection_reason=?
       WHERE id=?`,
      [reason, id]
    );

    await db.query(
      `UPDATE users 
       SET owner_verification_status='rejected'
       WHERE id = (SELECT owner_id FROM owner_verifications WHERE id=?)`,
      [id]
    );

    res.json({ success: true, message: "Verification rejected" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


const approve = async (id) => {
  const token = await auth.currentUser.getIdToken();

  await axios.patch(
    `${API}/owner-verifications/${id}/approve`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );

  alert("✅ Owner verified successfully"); // ← THIS IS ENOUGH
  load();
};

const reject = async (id) => {
  const reason = prompt("Rejection reason?");
  if (!reason) return;

  const token = await auth.currentUser.getIdToken();

  await axios.patch(
    `${API}/owner-verifications/${id}/reject`,
    { reason },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  alert("❌ Verification rejected"); // ← THIS IS ENOUGH
  load();
};
