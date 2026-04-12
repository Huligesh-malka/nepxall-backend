const db = require("../db");

/* ======================================================
   GET OWNER FROM FIREBASE UID
====================================================== */
const getOwner = async (firebase_uid) => {
  const [rows] = await db.query(
    `SELECT id, name, email, owner_verification_status
     FROM users 
     WHERE firebase_uid = ? AND role = 'owner'
     LIMIT 1`,
    [firebase_uid]
  );

  return rows[0] || null;
};

/* ======================================================
   SAVE / UPDATE BANK
====================================================== */
exports.saveOwnerBank = async (req, res) => {
  try {
    const owner = await getOwner(req.user.firebase_uid);

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

    //////////////////////////////////////////////////////
    // 🔐 ENCRYPT DATA
    //////////////////////////////////////////////////////
    const enc_account = encrypt(account_number);
    const enc_ifsc = encrypt(ifsc);
    const enc_holder = encrypt(account_holder_name);

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
        enc_holder,
        enc_account,
        enc_ifsc,
        bank_name || null,
        branch || null
      ]
    );

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
    const owner = await getOwner(req.user.firebase_uid);

    if (!owner) {
      return res.status(403).json({ success: false, message: "Not an owner" });
    }

    const [rows] = await db.query(
      `SELECT account_holder_name, account_number, ifsc, bank_name, branch
       FROM owner_bank_details
       WHERE owner_id = ?`,
      [owner.id]
    );

    let data = rows[0] || null;

    if (data) {
      try {
        const holder = decrypt(data.account_holder_name);
        const acc = decrypt(data.account_number);
        const ifsc = decrypt(data.ifsc);

        data.account_holder_name = holder;
        data.account_number = maskAccount(acc); // 🔒 masked
        data.ifsc = maskIFSC(ifsc); // 🔒 masked

      } catch (err) {
        console.log("⚠️ Decrypt skipped (old data)");
      }
    }

    res.json({
      success: true,
      data
    });

  } catch (err) {
    console.error("❌ GET BANK ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.sqlMessage || err.message
    });
  }
};