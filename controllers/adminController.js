const db = require("../db");
const path = require("path");
const fs = require("fs").promises;


/* ================= PENDING PGs ================= */
exports.getPendingPGs = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        pgs.*,
        users.name AS owner_name,
        users.email AS owner_email,
        users.phone AS owner_phone
      FROM pgs
      JOIN users ON users.id = pgs.owner_id
      WHERE pgs.status = 'pending'
        AND pgs.is_deleted = 0
      ORDER BY pgs.created_at DESC
    `);

    rows.forEach(pg => {
      pg.photos = safeParsePhotos(pg.photos);
      normalizePrices(pg);
    });

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("getPendingPGs error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch pending PGs" });
  }
};

/* ================= APPROVE PG ================= */
exports.approvePG = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      `UPDATE pgs 
       SET status = 'active', approved_at = NOW(), rejection_reason = NULL 
       WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "PG not found" });
    }

    res.json({ success: true, message: "PG approved successfully" });
  } catch (err) {
    console.error("approvePG error:", err);
    res.status(500).json({ success: false, message: "Approval failed" });
  }
};
/* ================= REJECT PG ================= */
exports.rejectPG = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const [result] = await db.query(
      `UPDATE pgs 
       SET status = 'rejected', rejection_reason = ? 
       WHERE id = ?`,
      [reason || "Rejected by admin", id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "PG not found" });
    }

    res.json({ success: true, message: "PG rejected successfully" });
  } catch (err) {
    console.error("rejectPG error:", err);
    res.status(500).json({ success: false, message: "Rejection failed" });
  }
};

/* ================= HELPERS ================= */
const toBool = (v) => (v === true || v === "true" || v === 1 ? 1 : 0);

const safeParsePhotos = (value) => {
  if (!value) return [];
  if (Buffer.isBuffer(value)) value = value.toString("utf8");
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const normalizePrices = (pg) => {
  [
    "single_sharing", "double_sharing", "triple_sharing", "four_sharing",
    "single_room", "double_room", "triple_room",
    "price_1bhk", "price_2bhk", "price_3bhk",
    "co_living_single_room", "co_living_double_room"
  ].forEach(k => {
    pg[k] = pg[k] ? Number(pg[k]) : null;
  });
};

/* =====================================================
   ✅ SINGLE SOURCE OF TRUTH — GET PG BY ID
===================================================== */
exports.getPGById = async (req, res) => {
  try {
    const { id } = req.params;

    const [[pg]] = await db.query(
      `
      SELECT 
        pgs.*,
        users.name AS owner_name,
        users.phone AS owner_phone,
        users.email AS owner_email
      FROM pgs
      JOIN users ON users.id = pgs.owner_id
      WHERE pgs.id = ?
        AND pgs.is_deleted = 0
      `,
      [id]
    );

    if (!pg) {
      return res.status(404).json({
        success: false,
        message: "PG not found"
      });
    }

    /* BOOLEAN NORMALIZATION */
    const boolFields = [
      "food_available","ac_available","wifi_available","tv",
      "parking_available","bike_parking","laundry_available",
      "washing_machine","refrigerator","microwave","geyser",
      "power_backup","lift_elevator","cctv","security_guard",
      "gym","housekeeping","water_purifier","fire_safety",
      "study_room","common_tv_lounge","balcony_open_space",
      "water_24x7","visitor_allowed","visitor_time_restricted",
      "couple_allowed","family_allowed","smoking_allowed",
      "drinking_allowed","pets_allowed","late_night_entry_allowed",
      "outside_food_allowed","parties_allowed","loud_music_restricted",
      "lock_in_period","agreement_mandatory","id_proof_mandatory",
      "office_going_only","students_only","boys_only","girls_only",
      "co_living_allowed","subletting_allowed"
    ];

    boolFields.forEach(k => {
      if (pg.hasOwnProperty(k)) pg[k] = pg[k] === 1;
    });

    normalizePrices(pg);

    /* 🔥 PHOTO + VIDEO PARSE (FIX) */
    pg.photos = safeParsePhotos(pg.photos);
    pg.videos = safeParsePhotos(pg.videos);

    res.json({ success: true, data: pg });

  } catch (err) {
    console.error("❌ getPGById error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch PG"
    });
  }
};

/* =====================================================
   UPLOAD PHOTOS ONLY
===================================================== */
exports.uploadPhotosOnly = async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({ success: false, message: "No photos uploaded" });
    }

    const newPhotos = files.map(f => `/uploads/pg-photos/${f.filename}`);

    const [[row]] = await db.query(
      "SELECT photos FROM pgs WHERE id = ? AND is_deleted = 0",
      [id]
    );

    if (!row) return res.status(404).json({ success: false, message: "PG not found" });

    const updatedPhotos = [...safeParsePhotos(row.photos), ...newPhotos];

    await db.query(
      "UPDATE pgs SET photos = ? WHERE id = ?",
      [JSON.stringify(updatedPhotos), id]
    );

    res.json({ success: true, photos: updatedPhotos });

  } catch (err) {
    console.error("Upload photo error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =====================================================
   DELETE SINGLE PHOTO
===================================================== */
exports.deleteSinglePhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const { photo } = req.body;

    const [[row]] = await db.query("SELECT photos FROM pgs WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ success: false });

    const photos = safeParsePhotos(row.photos).filter(p => p !== photo);

    await db.query("UPDATE pgs SET photos = ? WHERE id = ?", [
      JSON.stringify(photos), id
    ]);

    try {
      await fs.unlink(path.join(__dirname, "..", photo));
    } catch {}

    res.json({ success: true, photos });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
