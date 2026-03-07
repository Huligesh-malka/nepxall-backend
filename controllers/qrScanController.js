const db = require("../config/db"); // use your db connection file

exports.getPGScanData = async (req, res) => {
  try {

    const { id } = req.params;

    const query = `
      SELECT 
        id,
        pg_name,
        rent_amount,
        available_rooms,
        single_sharing,
        double_sharing,
        triple_sharing,
        four_sharing,
        contact_phone,
        city,
        area
      FROM pg
      WHERE id = ? 
      AND status = 'active'
      AND is_deleted = 0
    `;

    db.query(query, [id], (err, result) => {

      if (err) {
        console.error("SCAN ERROR:", err);
        return res.status(500).json({
          success: false,
          message: "Database error"
        });
      }

      if (!result.length) {
        return res.status(404).json({
          success: false,
          message: "PG not found"
        });
      }

      res.json({
        success: true,
        data: result[0]
      });

    });

  } catch (error) {

    console.error("QR SCAN ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }
};