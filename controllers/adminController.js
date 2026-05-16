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

exports.uploadPhotosOnly = async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({
        success: false,
        message: "No photos uploaded"
      });
    }

    // ✅ FIXED
    const newPhotos = files.map(
      (f) => f.secure_url || f.path
    );

    const [[row]] = await db.query(
      "SELECT photos FROM pgs WHERE id = ? AND is_deleted = 0",
      [id]
    );

    if (!row) {
      return res.status(404).json({
        success: false,
        message: "PG not found"
      });
    }

    const updatedPhotos = [
      ...safeParsePhotos(row.photos),
      ...newPhotos
    ];

    await db.query(
      "UPDATE pgs SET photos = ? WHERE id = ?",
      [JSON.stringify(updatedPhotos), id]
    );

    res.json({
      success: true,
      photos: updatedPhotos
    });

  } catch (err) {
    console.error("Upload photo error:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });
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







/* ================= ADMIN - ALL PGs ================= */
exports.getAllPGsAdmin = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        pgs.*,
        users.name AS owner_name,
        users.phone AS owner_phone
      FROM pgs
      JOIN users ON users.id = pgs.owner_id
      WHERE pgs.is_deleted = 0
      ORDER BY pgs.created_at DESC
    `);

    rows.forEach(pg => {
      pg.photos = safeParsePhotos(pg.photos);
      normalizePrices(pg);
    });

    res.json({ success: true, data: rows });

  } catch (err) {
    console.error("getAllPGsAdmin error:", err);
    res.status(500).json({ success: false });
  }
};

exports.updatePGField = async (req, res) => {
  try {
    const { id } = req.params;
    const { field, value } = req.body;

    console.log("Updating field:", field, "Value:", value);

    // 🔒 COMPLETE ALLOWED FIELDS LIST - FULL SUPPORT FOR PG, COLIVING, TO LET
    const allowedFields = [

      /*
      =========================================
      BASIC INFO
      =========================================
      */

      "pg_name",
      "pg_code",
      "pg_category",
      "pg_type",
      "status",
      "description",

      /*
      =========================================
      LOCATION
      =========================================
      */

      "location",
      "address",
      "city",
      "area",
      "road",
      "landmark",
      "pincode",
      "state",
      "country",
      "latitude",
      "longitude",

      /*
      =========================================
      CONTACT
      =========================================
      */

      "contact_person",
      "contact_phone",
      "contact_email",

      /*
      =========================================
      RENT & PRICE
      =========================================
      */

      "rent_amount",
      "deposit_amount",
      "maintenance_amount",
      "brokerage_amount",

      /*
      =========================================
      NORMAL PG PRICES
      =========================================
      */

      "single_sharing",
      "double_sharing",
      "triple_sharing",
      "four_sharing",

      "single_room",
      "double_room",
      "triple_room",

      /*
      =========================================
      COLIVING PRICES
      =========================================
      */

      "co_living_single_room",
      "co_living_double_room",
      "coliving_three_sharing",
      "coliving_four_sharing",

      /*
      =========================================
      TOLET / BHK
      =========================================
      */

      "bhk_type",
      "furnishing_type",

      "price_1bhk",
      "price_2bhk",
      "price_3bhk",
      "price_4bhk",

      "bedrooms_1bhk",
      "bathrooms_1bhk",

      "bedrooms_2bhk",
      "bathrooms_2bhk",

      "bedrooms_3bhk",
      "bathrooms_3bhk",

      "bedrooms_4bhk",
      "bathrooms_4bhk",

      /*
      =========================================
      MINIMUM STAY
      =========================================
      */

      "min_stay_available",
      "min_stay_days",
      "min_stay_months",
      "lock_in_period",
      "notice_period",

      /*
      =========================================
      FOOD & FACILITIES
      =========================================
      */

      "food_available",
      "food_type",
      "meals_per_day",

      "ac_available",
      "wifi_available",
      "tv",

      "parking_available",
      "bike_parking",

      "laundry_available",
      "washing_machine",

      "refrigerator",
      "microwave",
      "geyser",

      "power_backup",
      "lift_elevator",

      "cctv",
      "security_guard",

      "gym",
      "housekeeping",

      "water_purifier",
      "fire_safety",

      "study_room",
      "common_tv_lounge",

      "balcony_open_space",

      "water_24x7",
      "water_type",

      /*
      =========================================
      ROOM FEATURES
      =========================================
      */

      "cupboard_available",
      "table_chair_available",
      "dining_table_available",

      "attached_bathroom",
      "balcony_available",

      "wall_mounted_clothes_hook",

      "bed_with_mattress",
      "fan_light",

      "kitchen_room",

      /*
      =========================================
      COLIVING FEATURES
      =========================================
      */

      "co_living_fully_furnished",
      "co_living_food_included",
      "co_living_wifi_included",
      "co_living_housekeeping",
      "co_living_power_backup",
      "co_living_maintenance",

      /*
      =========================================
      RULES
      =========================================
      */

      "visitor_allowed",
      "visitor_time_restricted",
      "visitors_allowed_till",

      "couple_allowed",
      "family_allowed",

      "smoking_allowed",
      "drinking_allowed",

      "pets_allowed",

      "late_night_entry_allowed",
      "entry_curfew_time",

      "outside_food_allowed",
      "parties_allowed",

      "loud_music_restricted",

      "agreement_mandatory",
      "id_proof_mandatory",

      "office_going_only",
      "students_only",

      "boys_only",
      "girls_only",

      "co_living_allowed",

      "subletting_allowed",

      /*
      =========================================
      ROOM COUNTS
      =========================================
      */

      "total_rooms",
      "available_rooms",

      /*
      =========================================
      NEARBY PLACES
      =========================================
      */

      "nearby_college",
      "nearby_school",
      "nearby_it_park",
      "nearby_office_hub",

      "nearby_metro",
      "nearby_bus_stop",
      "nearby_railway_station",

      "distance_main_road",

      "nearby_hospital",
      "nearby_clinic",
      "nearby_pharmacy",

      "nearby_supermarket",
      "nearby_grocery_store",

      "nearby_restaurant",
      "nearby_mall",

      "nearby_bank",
      "nearby_atm",

      "nearby_post_office",

      "nearby_gym",
      "nearby_park",

      "nearby_temple",
      "nearby_mosque",
      "nearby_church",

      "nearby_police_station"

    ];

    if (!allowedFields.includes(field)) {
      return res.status(400).json({
        success: false,
        message: `Field '${field}' is not allowed for update`
      });
    }

    // 🔥 VALUE CLEANING BASED ON FIELD TYPE
    let finalValue = value;

    // Handle empty values
    if (value === "" || value === "—" || value === null) {
      finalValue = null;
    }

    // Convert boolean fields (true/false strings to 0/1)
    const booleanFields = [
      "min_stay_available", "food_available", "ac_available", "wifi_available",
      "tv", "parking_available", "bike_parking", "laundry_available",
      "washing_machine", "refrigerator", "microwave", "geyser", "power_backup",
      "lift_elevator", "cctv", "security_guard", "gym", "housekeeping",
      "water_purifier", "fire_safety", "study_room", "common_tv_lounge",
      "balcony_open_space", "water_24x7", "cupboard_available",
      "table_chair_available", "dining_table_available", "attached_bathroom",
      "balcony_available", "wall_mounted_clothes_hook", "bed_with_mattress",
      "fan_light", "kitchen_room", "co_living_fully_furnished",
      "co_living_food_included", "co_living_wifi_included", "co_living_housekeeping",
      "co_living_power_backup", "co_living_maintenance", "visitor_allowed",
      "visitor_time_restricted", "couple_allowed", "family_allowed",
      "smoking_allowed", "drinking_allowed", "pets_allowed", "late_night_entry_allowed",
      "outside_food_allowed", "parties_allowed", "loud_music_restricted",
      "agreement_mandatory", "id_proof_mandatory", "office_going_only",
      "students_only", "boys_only", "girls_only", "co_living_allowed", "subletting_allowed"
    ];

    if (booleanFields.includes(field)) {
      if (finalValue === "true" || finalValue === true || finalValue === "1" || finalValue === 1) {
        finalValue = 1;
      } else if (finalValue === "false" || finalValue === false || finalValue === "0" || finalValue === 0) {
        finalValue = 0;
      } else {
        finalValue = finalValue ? 1 : 0;
      }
    }
    
    // Convert numeric fields
    const numberFields = [
      "single_sharing", "double_sharing", "triple_sharing", "four_sharing",
      "single_room", "double_room", "triple_room",
      "coliving_three_sharing", "coliving_four_sharing",
      "price_1bhk", "price_2bhk", "price_3bhk", "price_4bhk",
      "co_living_single_room", "co_living_double_room",
      "deposit_amount", "maintenance_amount", "rent_amount", "brokerage_amount",
      "bedrooms_1bhk", "bathrooms_1bhk", "bedrooms_2bhk", "bathrooms_2bhk",
      "bedrooms_3bhk", "bathrooms_3bhk", "bedrooms_4bhk", "bathrooms_4bhk",
      "min_stay_days", "min_stay_months", "lock_in_period", "notice_period",
      "total_rooms", "available_rooms", "meals_per_day",
      "latitude", "longitude"
    ];

    if (numberFields.includes(field)) {
      if (finalValue !== null && finalValue !== "") {
        finalValue = Number(finalValue);
        if (isNaN(finalValue)) finalValue = null;
      } else {
        finalValue = null;
      }
    }

    // 🔥 UPDATE FIELD
    await db.query(
      `UPDATE pgs SET ${field} = ? WHERE id = ?`,
      [finalValue, id]
    );

    // 🔥 AUTO UPDATE RENT_AMOUNT if pricing fields changed
    const pricingFields = [
      "single_sharing", "double_sharing", "triple_sharing", "four_sharing",
      "single_room", "double_room", "triple_room",
      "coliving_three_sharing", "coliving_four_sharing",
      "price_1bhk", "price_2bhk", "price_3bhk", "price_4bhk",
      "co_living_single_room", "co_living_double_room"
    ];

    if (pricingFields.includes(field)) {
      const [rows] = await db.query(
        "SELECT * FROM pgs WHERE id = ?",
        [id]
      );

      if (rows.length > 0) {
        const pg = rows[0];
        
        const prices = [];
        const allPriceFields = [
          pg.single_sharing, pg.double_sharing, pg.triple_sharing, pg.four_sharing,
          pg.single_room, pg.double_room, pg.triple_room,
          pg.coliving_three_sharing, pg.coliving_four_sharing,
          pg.price_1bhk, pg.price_2bhk, pg.price_3bhk, pg.price_4bhk,
          pg.co_living_single_room, pg.co_living_double_room
        ];
        
        for (let price of allPriceFields) {
          if (price && price > 0) {
            prices.push(price);
          }
        }
        
        const rent_amount = prices.length ? Math.min(...prices) : 0;
        
        await db.query(
          "UPDATE pgs SET rent_amount = ? WHERE id = ?",
          [rent_amount, id]
        );
      }
    }

    res.json({ 
      success: true, 
      message: `${field} updated successfully`,
      updatedValue: finalValue 
    });

  } catch (err) {
    console.error("updatePGField error:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};



exports.getAllBookingsForAdmin = async (req, res) => {
  try {

    const [rows] = await db.query(`
      SELECT

        b.id,
        b.status,
        b.room_type,
        b.check_in_date,
        b.created_at,

        b.rent_amount,
        b.security_deposit,
        b.maintenance_amount,

        /* USER */
        u.id AS user_id,
        u.name AS user_name,
        u.phone AS user_phone,
        u.email AS user_email,

        /* OWNER */
        o.id AS owner_id,
        o.name AS owner_name,
        o.phone AS owner_phone,
        o.email AS owner_email,

        /* PG */
        p.id AS pg_id,
        p.pg_name,
        p.city,
        p.area,
        p.contact_phone,

        /* PAYMENT */
        pay.status AS payment_status,
        pay.order_id,
        pay.amount AS paid_amount

      FROM bookings b

      JOIN users u
      ON u.id = b.user_id

      JOIN users o
      ON o.id = b.owner_id

      JOIN pgs p
      ON p.id = b.pg_id

      LEFT JOIN payments pay
      ON pay.booking_id = b.id

      ORDER BY b.created_at DESC
    `);

    res.json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (err) {

    console.error(
      "ADMIN BOOKINGS ERROR:",
      err
    );

    res.status(500).json({
      success: false,
      message: err.message
    });

  }
};