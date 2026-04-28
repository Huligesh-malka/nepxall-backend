const db = require("../db");
const { decrypt } = require("../utils/encryption");
const sendNotification = require("../utils/sendNotification"); // ✅ ADDED

exports.getPendingSettlements = async (req, res) => {
  try {

    const [rows] = await db.query(`
      SELECT 
        b.id AS booking_id,
        b.owner_id,

        /* ✅ OWNER AMOUNT */
        (
          COALESCE(b.rent_amount, 0) +
          COALESCE(b.security_deposit, 0) +
          COALESCE(b.maintenance_amount, 0)
        ) AS owner_amount,

        /* 🔥 TOTAL PAYMENT */
        pay.amount AS payment_amount,

        /* 🔥 ADMIN PROFIT */
        (
          pay.amount - 
          (
            COALESCE(b.rent_amount, 0) +
            COALESCE(b.security_deposit, 0) +
            COALESCE(b.maintenance_amount, 0)
          )
        ) AS admin_profit,

        /* ✅ JOIN STATUS ADDED */
        CASE 
          WHEN EXISTS (
            SELECT 1 
            FROM pg_checkins pc 
            WHERE pc.booking_id = b.id
          ) THEN 'JOINED'
          ELSE 'NOT_JOINED'
        END AS join_status,

        u.name AS owner_name,
        u.phone AS owner_phone,
        u.fcm_token AS owner_fcm_token,

        pg.id AS pg_id,
        pg.pg_name,
        pg.city,
        pg.area,

        obd.account_holder_name,
        obd.account_number,
        obd.ifsc,
        obd.bank_name,
        obd.branch,

        pay.id AS payment_id,
        pay.order_id,
        pay.created_at AS payment_date,
        pay.status AS payment_status,
        pay.utr

      FROM bookings b

      INNER JOIN payments pay 
        ON pay.booking_id = b.id
        AND pay.status = 'paid'

      LEFT JOIN users u
        ON u.id = b.owner_id

      LEFT JOIN pgs pg
        ON pg.id = b.pg_id

      LEFT JOIN owner_bank_details obd
        ON obd.owner_id = b.owner_id

      WHERE b.admin_settlement = 'PENDING'

      ORDER BY pay.created_at DESC
    `);

    // 🔓 Decrypt
    rows.forEach(r => {
      try {
        r.account_holder_name = r.account_holder_name
          ? decrypt(r.account_holder_name)
          : null;

        r.account_number = r.account_number
          ? decrypt(r.account_number)
          : null;

        r.ifsc = r.ifsc
          ? decrypt(r.ifsc)
          : null;

      } catch (err) {
        console.log("⚠️ Decrypt skipped");
      }
    });

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error("Settlement error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load settlements"
    });
  }
};

//////////////////////////////////////////////////////
// MARK OWNER SETTLED
//////////////////////////////////////////////////////
exports.markAsSettled = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;

    // 🔥 GET FULL DATA
    const [rows] = await db.query(`
      SELECT 
        b.id,
        b.owner_id,
        b.owner_amount,
        b.owner_settlement,
        b.room_type,
        u.name,
        u.phone,
        u.fcm_token,
        pg.pg_name,
        pay.order_id
      FROM bookings b
      JOIN users u ON u.id = b.owner_id
      JOIN pgs pg ON pg.id = b.pg_id
      LEFT JOIN payments pay ON pay.booking_id = b.id
      WHERE b.id = ?
    `, [bookingId]);

    const data = rows[0];

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    // 🔥 UPDATE BOOKINGS
    await db.query(`
      UPDATE bookings 
      SET admin_settlement = 'DONE',
          owner_settlement = 'PENDING'
      WHERE id = ?
    `, [bookingId]);

    // 🔥 INSERT INTO HISTORY (PERMANENT)
    await db.query(`
      INSERT INTO settlement_history (
        booking_id,
        owner_id,
        owner_name,
        owner_phone,
        pg_name,
        amount,
        order_id,
        admin_settlement,
        owner_settlement,
        settled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      data.id,
      data.owner_id,
      data.name,
      data.phone,
      data.pg_name,
      data.owner_amount,
      data.order_id,
      "DONE",
      "PENDING"
    ]);

    //////////////////////////////////////////////////////
    // 🔔 SEND NOTIFICATION TO OWNER
    //////////////////////////////////////////////////////
    if (data.fcm_token) {
      await sendNotification(
        data.fcm_token,
        "Settlement Initiated 💰",
        `Admin settlement of ₹${data.owner_amount} for ${data.pg_name || data.room_type || "booking"} has been initiated. Payment will be processed soon.`
      );
    }

    // Insert in-app notification for owner
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        data.owner_id,
        "Settlement Initiated 💰",
        `Admin settlement of ₹${data.owner_amount} for ${data.pg_name || "PG"} has been initiated. Payment will be processed soon.`,
        "settlement_initiated"
      ]
    );

    res.json({
      success: true,
      message: "Admin settlement stored permanently ✅",
      notification_sent: !!data.fcm_token
    });

  } catch (err) {
    console.error("Mark as settled error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

//////////////////////////////////////////////////////
// MARK OWNER PAYMENT COMPLETED
//////////////////////////////////////////////////////
exports.markOwnerPaymentCompleted = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { transaction_id, payment_mode = "BANK_TRANSFER" } = req.body;

    // Get booking details
    const [[booking]] = await db.query(`
      SELECT 
        b.id,
        b.owner_id,
        b.owner_amount,
        b.room_type,
        u.name,
        u.phone,
        u.fcm_token,
        pg.pg_name
      FROM bookings b
      JOIN users u ON u.id = b.owner_id
      JOIN pgs pg ON pg.id = b.pg_id
      WHERE b.id = ?
    `, [bookingId]);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    // Update settlement status
    await db.query(`
      UPDATE bookings 
      SET owner_settlement = 'DONE',
          settlement_date = NOW(),
          settlement_transaction_id = ?,
          settlement_payment_mode = ?
      WHERE id = ?
    `, [transaction_id, payment_mode, bookingId]);

    // Update settlement history
    await db.query(`
      UPDATE settlement_history 
      SET owner_settlement = 'DONE',
          owner_settlement_date = NOW(),
          transaction_id = ?
      WHERE booking_id = ?
    `, [transaction_id, bookingId]);

    //////////////////////////////////////////////////////
    // 🔔 SEND NOTIFICATION TO OWNER
    //////////////////////////////////////////////////////
    if (booking.fcm_token) {
      await sendNotification(
        booking.fcm_token,
        "Payment Received 💳",
        `Your payment of ₹${booking.owner_amount} for ${booking.pg_name || booking.room_type || "booking"} has been credited to your account.`
      );
    }

    // Insert in-app notification for owner
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [
        booking.owner_id,
        "Payment Received 💳",
        `Your payment of ₹${booking.owner_amount} for ${booking.pg_name || "PG"} has been credited to your account.`,
        "payment_received"
      ]
    );

    res.json({
      success: true,
      message: "Owner payment marked as completed",
      notification_sent: !!booking.fcm_token
    });

  } catch (err) {
    console.error("Mark owner payment completed error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

exports.getSettlementHistory = async (req, res) => {
  try {

    const [rows] = await db.query(`
      SELECT *
      FROM settlement_history
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error("Get settlement history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load history"
    });
  }
};

//////////////////////////////////////////////////////
// GET OWNER SETTLEMENT DETAILS
//////////////////////////////////////////////////////
exports.getOwnerSettlementDetails = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const [rows] = await db.query(`
      SELECT 
        sh.*,
        b.room_type,
        b.check_in_date,
        p.pg_name,
        p.city
      FROM settlement_history sh
      JOIN bookings b ON b.id = sh.booking_id
      JOIN pgs p ON p.id = b.pg_id
      WHERE sh.owner_id = ?
      ORDER BY sh.created_at DESC
    `, [ownerId]);

    // Calculate totals
    const totals = {
      total_settled: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      total_pending: rows.filter(row => row.owner_settlement === 'PENDING').length,
      total_completed: rows.filter(row => row.owner_settlement === 'DONE').length
    };

    res.json({
      success: true,
      data: rows,
      totals: totals
    });

  } catch (err) {
    console.error("Get owner settlement details error:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

//////////////////////////////////////////////////////
// GET SETTLEMENT SUMMARY (ADMIN DASHBOARD)
//////////////////////////////////////////////////////
exports.getSettlementSummary = async (req, res) => {
  try {
    const [summary] = await db.query(`
      SELECT 
        COUNT(*) as total_settlements,
        SUM(CASE WHEN admin_settlement = 'PENDING' THEN 1 ELSE 0 END) as pending_admin,
        SUM(CASE WHEN admin_settlement = 'DONE' THEN 1 ELSE 0 END) as completed_admin,
        SUM(CASE WHEN owner_settlement = 'PENDING' THEN 1 ELSE 0 END) as pending_owner,
        SUM(CASE WHEN owner_settlement = 'DONE' THEN 1 ELSE 0 END) as completed_owner,
        SUM(owner_amount) as total_amount_pending,
        SUM(CASE WHEN owner_settlement = 'DONE' THEN owner_amount ELSE 0 END) as total_amount_paid
      FROM settlement_history
    `);

    const [monthlyStats] = await db.query(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM settlement_history
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month DESC
    `);

    res.json({
      success: true,
      summary: summary[0],
      monthly_stats: monthlyStats
    });

  } catch (err) {
    console.error("Get settlement summary error:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

//////////////////////////////////////////////////////
// GET SETTLEMENT BY BOOKING ID
//////////////////////////////////////////////////////
exports.getSettlementByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const [rows] = await db.query(`
      SELECT 
        sh.*,
        b.room_type,
        b.check_in_date,
        b.check_out_date,
        pg.pg_name,
        pg.city,
        pg.area
      FROM settlement_history sh
      JOIN bookings b ON b.id = sh.booking_id
      JOIN pgs pg ON pg.id = b.pg_id
      WHERE sh.booking_id = ?
    `, [bookingId]);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Settlement not found for this booking"
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });

  } catch (err) {
    console.error("Get settlement by booking id error:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};