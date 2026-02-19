const db = require("../db");

/* ================= ADD / UPDATE REVIEW ================= */
exports.addReview = (req, res) => {
  const { pg_id, user_id, rating, comment } = req.body;

  if (!pg_id || !user_id || !rating) {
    return res.status(400).json({
      success: false,
      message: "Missing fields"
    });
  }

  const sql = `
    INSERT INTO pg_reviews (pg_id, user_id, rating, comment)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      rating = VALUES(rating),
      comment = VALUES(comment),
      updated_at = CURRENT_TIMESTAMP
  `;

  db.query(sql, [pg_id, user_id, rating, comment || null], (err) => {
    if (err) {
      console.error("ADD REVIEW ERROR:", err.sqlMessage || err);
      return res.status(500).json({
        success: false,
        message: "Failed to save review"
      });
    }

    res.json({
      success: true,
      message: "Review saved successfully"
    });
  });
};

/* ================= GET REVIEWS BY PG ================= */
exports.getReviewsByPG = (req, res) => {
  const { pgId } = req.params;

  const sql = `
    SELECT 
      r.id,
      r.rating,
      r.comment,
      r.created_at,
      u.name AS user_name,
      rr.reply AS owner_reply,
      rr.created_at AS reply_date
    FROM pg_reviews r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN pg_review_replies rr ON rr.review_id = r.id
    WHERE r.pg_id = ?
    ORDER BY r.created_at DESC
  `;

  db.query(sql, [pgId], (err, rows) => {
    if (err) {
      console.error("GET REVIEWS ERROR:", err.sqlMessage || err);
      return res.status(500).json({
        success: false,
        message: "Failed to load reviews"
      });
    }

    const avg =
      rows.length > 0
        ? rows.reduce((sum, r) => sum + r.rating, 0) / rows.length
        : 0;

    res.json({
      success: true,
      averageRating: Number(avg.toFixed(1)),
      totalReviews: rows.length,
      data: rows
    });
  });
};

/* ================= ADD / UPDATE OWNER REPLY ================= */
exports.addOwnerReply = (req, res) => {
  const { review_id, owner_id, reply } = req.body;

  if (!review_id || !owner_id || !reply) {
    return res.status(400).json({
      success: false,
      message: "Missing fields"
    });
  }

  /* 1️⃣ VERIFY OWNER OWNS THIS PG */
  const checkSql = `
    SELECT r.user_id, r.pg_id
    FROM pg_reviews r
    JOIN pgs p ON p.id = r.pg_id
    WHERE r.id = ? AND p.owner_id = ?
  `;

  db.query(checkSql, [review_id, owner_id], (err, rows) => {
    if (err || rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to reply to this review"
      });
    }

    const userId = rows[0].user_id;
    const pgId = rows[0].pg_id;

    /* 2️⃣ INSERT / UPDATE OWNER REPLY */
    const replySql = `
      INSERT INTO pg_review_replies (review_id, owner_id, reply)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        reply = VALUES(reply),
        created_at = CURRENT_TIMESTAMP
    `;

    db.query(replySql, [review_id, owner_id, reply], (err2) => {
      if (err2) {
        console.error("OWNER REPLY ERROR:", err2.sqlMessage || err2);
        return res.status(500).json({
          success: false,
          message: "Failed to save reply"
        });
      }

      /* 3️⃣ CREATE USER NOTIFICATION */
      const notifySql = `
        INSERT INTO notifications (user_id, title, message)
        VALUES (?, ?, ?)
      `;

      db.query(
        notifySql,
        [
          userId,
          "Owner replied to your review",
          `The PG owner replied to your review. PG ID: ${pgId}`
        ],
        () => {}
      );

      res.json({
        success: true,
        message: "Reply saved & user notified"
      });
    });
  });
};
