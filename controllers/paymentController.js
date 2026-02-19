const db = require("../db");

/* ===============================
   MOCK PAYMENT
================================ */
exports.makePayment = (req, res) => {
  const {
    booking_id,
    user_id,
    pg_id,
    payment_type,
    amount,
    month_year,
  } = req.body;

  if (!booking_id || !user_id || !pg_id || !payment_type || !amount) {
    return res.status(400).json({ message: "Missing payment fields" });
  }

  db.query(
    `INSERT INTO pg_payments
     (booking_id, user_id, pg_id, payment_type, month_year, amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [booking_id, user_id, pg_id, payment_type, month_year || null, amount],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Payment failed" });
      }

      // mark booking as paid after deposit
      if (payment_type === "deposit") {
        db.query(
          `UPDATE pg_bookings SET status = 'paid' WHERE id = ?`,
          [booking_id]
        );
      }

      res.json({ message: "Payment successful ✅" });
    }
  );
};

/* ===============================
   USER PAYMENT HISTORY
================================ */
exports.getUserPayments = (req, res) => {
  db.query(
    `
    SELECT 
      p.id,
      p.amount,
      p.payment_type,
      p.month_year,
      p.payment_date,
      g.pg_name
    FROM pg_payments p
    JOIN pgs g ON g.id = p.pg_id
    WHERE p.user_id = ?
    ORDER BY p.payment_date DESC
    `,
    [req.params.userId],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "DB error" });
      }
      res.json(rows);
    }
  );
};
