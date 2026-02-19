const db = require("../db");

/* =========================
   TENANT REQUESTS VACATE
========================= */
exports.requestVacate = (req, res) => {
  const { agreement_id } = req.body;

  if (!agreement_id)
    return res.status(400).json({ message: "agreement_id required" });

  db.query(
    "UPDATE agreements SET status = 'VACATING' WHERE id = ?",
    [agreement_id],
    (err) => {
      if (err) return res.status(500).json({ message: "Vacate failed" });
      res.json({ message: "Vacate request submitted ✅" });
    }
  );
};

/* =========================
   OWNER ADDS DAMAGE
========================= */
exports.addDamage = (req, res) => {
  const { agreement_id, description, cost } = req.body;

  if (!agreement_id || !cost)
    return res.status(400).json({ message: "Missing fields" });

  db.query(
    `INSERT INTO damages (agreement_id, description, cost)
     VALUES (?, ?, ?)`,
    [agreement_id, description, cost],
    (err) => {
      if (err) return res.status(500).json({ message: "Damage add failed" });
      res.json({ message: "Damage proposed (PENDING) ✅" });
    }
  );
};

/* =========================
   TENANT VIEWS DAMAGES
========================= */
exports.getDamages = (req, res) => {
  const { agreementId } = req.params;

  db.query(
    `SELECT id, description, cost, status
     FROM damages WHERE agreement_id = ?`,
    [agreementId],
    (err, results) => {
      if (err) return res.status(500).json({ message: "Fetch failed" });
      res.json(results);
    }
  );
};

/* =========================
   TENANT ACCEPTS DAMAGE
========================= */
exports.acceptDamage = (req, res) => {
  const { damage_id } = req.body;

  db.query(
    `UPDATE damages SET status = 'ACCEPTED' WHERE id = ?`,
    [damage_id],
    (err) => {
      if (err) return res.status(500).json({ message: "Accept failed" });
      res.json({ message: "Damage accepted ✅" });
    }
  );
};

/* =========================
   TENANT REJECTS DAMAGE
========================= */
exports.rejectDamage = (req, res) => {
  const { damage_id } = req.body;

  db.query(
    `UPDATE damages SET status = 'REJECTED' WHERE id = ?`,
    [damage_id],
    (err) => {
      if (err) return res.status(500).json({ message: "Reject failed" });
      res.json({ message: "Damage rejected ❌" });
    }
  );
};

/* =========================
   SETTLEMENT CALCULATION
========================= */
exports.getSettlement = (req, res) => {
  const { agreementId } = req.params;

  db.query(
    `
    SELECT 
      a.deposit_amount,
      IFNULL(SUM(d.cost), 0) AS total_damage,
      (a.deposit_amount - IFNULL(SUM(d.cost), 0)) AS refundable_amount
    FROM agreements a
    LEFT JOIN damages d 
      ON a.id = d.agreement_id AND d.status = 'ACCEPTED'
    WHERE a.id = ?
    GROUP BY a.id
    `,
    [agreementId],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Settlement failed" });
      res.json(result[0]);
    }
  );
};

/* =========================
   CLOSE AGREEMENT
========================= */
exports.closeAgreement = (req, res) => {
  const { agreement_id } = req.body;

  db.query(
    "UPDATE agreements SET status = 'CLOSED' WHERE id = ?",
    [agreement_id],
    (err) => {
      if (err) return res.status(500).json({ message: "Close failed" });
      res.json({ message: "Agreement closed successfully ✅" });
    }
  );
};
