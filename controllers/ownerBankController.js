const db = require("../db");

/* ======================================================
   GET OWNER FROM FIREBASE UID
====================================================== */
const getOwner = async (firebaseUid) => {
  const [rows] = await db.query(
    `SELECT id, name, email, owner_verification_status
     FROM users 
     WHERE firebase_uid = ? AND role = 'owner'
     LIMIT 1`,
    [firebaseUid]
  );

  return rows[0] || null;
};

/* ======================================================
   SAVE / UPDATE BANK
====================================================== */
exports.saveOwnerBank = async (req, res) => {
  try {
    const owner = await getOwner(req.user.firebaseUid);

    if (!owner) {
      return res.status(403).json({ success: false, message: "Not an owner" });
    }

    const {
      account_holder_name,
      account_number,
      ifsc,
      bank_name,
      branch
    } = req.body;

    if (!account_holder_name || !account_number || !ifsc) {
      return res.status(400).json({
        success: false,
        message: "Account holder name, account number & IFSC are required"
      });
    }

    /* ================= SAVE BANK ================= */
    await db.query(
      `INSERT INTO owner_bank_details
       (owner_id, account_holder_name, account_number, ifsc, bank_name, branch)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       account_holder_name = VALUES(account_holder_name),
       account_number = VALUES(account_number),
       ifsc = VALUES(ifsc),
       bank_name = VALUES(bank_name),
       branch = VALUES(branch)`,
      [
        owner.id,
        account_holder_name,
        account_number,
        ifsc,
        bank_name || null,
        branch || null
      ]
    );

    /* ================= MARK OWNER AS VERIFIED ================= */
    await db.query(
      `UPDATE users 
       SET owner_verification_status = 'verified'
       WHERE id = ?`,
      [owner.id]
    );

    res.json({
      success: true,
      message: "Bank details saved successfully"
    });

  } catch (err) {
    console.error("❌ SAVE BANK ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.sqlMessage || err.message
    });
  }
};

/* ======================================================
   GET BANK
====================================================== */
exports.getOwnerBank = async (req, res) => {
  try {
    const owner = await getOwner(req.user.firebaseUid);

    if (!owner) {
      return res.status(403).json({ success: false, message: "Not an owner" });
    }

    const [rows] = await db.query(
      `SELECT account_holder_name, account_number, ifsc, bank_name, branch
       FROM owner_bank_details
       WHERE owner_id = ?`,
      [owner.id]
    );

    res.json({
      success: true,
      data: rows[0] || null
    });

  } catch (err) {
    console.error("❌ GET BANK ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.sqlMessage || err.message
    });
  }
};