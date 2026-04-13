const db = require("../db");
const plans = require("../config/plans");

// Helper function to get user's plan object with expiry handling
const getUserPlanObject = async (userId) => {
  const [[user]] = await db.query(
    "SELECT plan, plan_expiry FROM users WHERE id = ?",
    [userId]
  );
  
  if (!user) return plans.free;
  
  // Check if premium plan has expired
  const currentPlan = plans[user.plan || "free"];
  if (user.plan !== "free" && user.plan_expiry && new Date(user.plan_expiry) < new Date()) {
    // Plan expired, revert to free
    return plans.free;
  }
  
  return currentPlan;
};

exports.makeFeatured = async (req, res) => {
  try {
    const { pgId } = req.params;
    const userId = req.user.id;

    // Check if PG belongs to user
    const [pgCheck] = await db.query(
      "SELECT id FROM pgs WHERE id = ? AND owner_id = ? AND is_deleted = 0",
      [pgId, userId]
    );

    if (pgCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: "PG not found or unauthorized"
      });
    }

    // Check if PG is already featured (IMPROVEMENT #2)
    const [existing] = await db.query(
      "SELECT featured_until FROM pgs WHERE id = ? AND owner_id = ?",
      [pgId, userId]
    );

    if (existing[0].featured_until && new Date(existing[0].featured_until) > new Date()) {
      return res.status(400).json({
        success: false,
        message: "This PG is already featured until " + new Date(existing[0].featured_until).toLocaleDateString()
      });
    }

    // Get user's plan object with expiry (IMPROVEMENT #1)
    const currentPlan = await getUserPlanObject(userId);

    // 🔒 Check if plan allows featured listings
    if (!currentPlan.featured) {
      return res.status(400).json({
        success: false,
        message: `Upgrade to ${currentPlan.name === 'free' ? 'Basic or Pro' : 'Pro'} plan to use Featured feature.`
      });
    }

    const days = currentPlan.featured_days;

    const featuredUntil = new Date(
      Date.now() + days * 24 * 60 * 60 * 1000
    );

    await db.query(
      `UPDATE pgs 
       SET is_featured = 1, featured_until = ?
       WHERE id = ? AND owner_id = ?`,
      [featuredUntil, pgId, userId]
    );

    res.json({
      success: true,
      message: `PG is now featured for ${days} days ⭐`,
      featured_until: featuredUntil
    });

  } catch (err) {
    console.error("Error making featured:", err);
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
  }
};

// Optional: Remove featured from expired listings (run via cron job)
exports.removeExpiredFeatured = async () => {
  try {
    const [result] = await db.query(
      "UPDATE pgs SET is_featured = 0, featured_until = NULL WHERE featured_until < NOW() AND is_featured = 1"
    );
    
    if (result.affectedRows > 0) {
      console.log(`Removed featured from ${result.affectedRows} expired listings`);
    }
    
    return result.affectedRows;
  } catch (err) {
    console.error("Error removing expired featured:", err);
    return 0;
  }
};