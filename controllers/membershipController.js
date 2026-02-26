const db = require("../db");

//////////////////////////////////////////////////////
// GET PLANS BY PROPERTY + ROOM TYPE
//////////////////////////////////////////////////////
exports.getPlansByProperty = async (req, res) => {
  try {
    const { propertyId, roomType } = req.query;

    const [plans] = await db.query(
      `SELECT * FROM membership_plans
       WHERE property_id=? AND room_type=?`,
      [propertyId, roomType]
    );

    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};