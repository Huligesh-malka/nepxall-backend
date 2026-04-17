const db = require("../db");

//////////////////////////////////////////////////////
// 🔥 GET ALL PENDING OWNER REQUESTS
//////////////////////////////////////////////////////
exports.getPendingOwners = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, name, email, phone, created_at
      FROM users
      WHERE role = 'pending_owner'
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error("getPendingOwners error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending owners"
    });
  }
};

//////////////////////////////////////////////////////
// 🔥 APPROVE OWNER
//////////////////////////////////////////////////////
exports.approveOwner = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      "UPDATE users SET role = 'owner' WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      message: "Owner approved successfully"
    });

  } catch (err) {
    console.error("approveOwner error:", err);
    res.status(500).json({
      success: false,
      message: "Approval failed"
    });
  }
};

//////////////////////////////////////////////////////
// 🔥 REJECT OWNER
//////////////////////////////////////////////////////
exports.rejectOwner = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      "UPDATE users SET role = 'tenant' WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      message: "Request rejected"
    });

  } catch (err) {
    console.error("rejectOwner error:", err);
    res.status(500).json({
      success: false,
      message: "Rejection failed"
    });
  }
};