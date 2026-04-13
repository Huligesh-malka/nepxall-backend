const db = require("../db");

exports.buyPlan = async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.user.id;

    const validPlans = ["free", "basic", "pro"];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ message: "Invalid plan" });
    }

    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.query(
      "UPDATE users SET plan=?, plan_expiry=? WHERE id=?",
      [plan, expiry, userId]
    );

    res.json({ success: true, message: "Plan activated 🚀" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};