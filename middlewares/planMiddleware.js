const db = require("../db");
const plans = require("../config/plans");

exports.checkPlan = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [[user]] = await db.query(
      "SELECT plan, plan_expiry FROM users WHERE id=?",
      [userId]
    );

    // expire check
    let planName = user.plan || "free";

    if (user.plan_expiry && new Date(user.plan_expiry) < new Date()) {
      planName = "free";
    }

    req.plan = plans[planName];
    req.planName = planName;

    next();

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};