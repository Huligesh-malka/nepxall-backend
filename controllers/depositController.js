const db = require("../db");

// ADD DEPOSIT
exports.addDeposit = (req, res) => {
  const { agreement_id, amount, payment_date, proof } = req.body;

  if (!agreement_id || !amount || !payment_date) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const sql = `
    INSERT INTO deposits (agreement_id, amount, payment_date, proof)
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [agreement_id, amount, payment_date, proof], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Deposit save failed" });
    }

    res.json({
      message: "Deposit recorded successfully ✅",
      depositId: result.insertId,
    });
  });
};

// GET DEPOSITS BY AGREEMENT
exports.getDepositsByAgreement = (req, res) => {
  const { agreementId } = req.params;

  const sql = `
    SELECT * FROM deposits WHERE agreement_id = ?
  `;

  db.query(sql, [agreementId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Fetch failed" });
    }

    res.json(results);
  });
};
