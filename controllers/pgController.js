const db = require("../db");
const path = require("path");
const fs = require("fs").promises;

/* ================= HELPERS ================= */
const toBool = (v) => (v === true || v === "true" || v === 1 ? 1 : 0);

function safeParsePhotos(value) {
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
}

const normalizePrices = (pg) => {
  [
    "single_sharing",
    "double_sharing",
    "triple_sharing",
    "four_sharing",
    "single_room",
    "double_room",
    "triple_room",
    "price_1bhk",
    "price_2bhk",
    "price_3bhk",
    "co_living_single_room",
    "co_living_double_room"
  ].forEach(k => {
    pg[k] = pg[k] ? Number(pg[k]) : null;
  });
};

const isFirebaseUid = (uid) => {
  return uid && typeof uid === 'string' && uid.length > 20 && /^[a-zA-Z0-9]+$/.test(uid);
};

/* ================= GET OR CREATE USER ================= */
const getOrCreateUserId = async (firebaseUid, userData = {}) => {
  console.log('getOrCreateUserId called with:', firebaseUid);
  
  if (!firebaseUid) {
    throw new Error('Firebase UID is required');
  }

  // If it's already a numeric ID, return it (for backward compatibility)
  if (!isNaN(firebaseUid) && Number.isInteger(Number(firebaseUid))) {
    console.log('Already numeric ID:', firebaseUid);
    return parseInt(firebaseUid);
  }

  try {
    // Check if user exists
    const [rows] = await db.query(
      'SELECT id FROM users WHERE firebase_uid = ?',
      [firebaseUid]
    );
    
    if (rows.length === 0) {
      // Create new user
      return await createNewUser(firebaseUid, userData);
    }
    
    return rows[0].id;
  } catch (err) {
    console.error('Database error checking user:', err);
    throw err;
  }
};

const createNewUser = async (firebaseUid, userData) => {
  // 🔥 FIXED: Default role is "tenant" not "user"
  const newUser = {
    firebase_uid: firebaseUid,

    name:
      userData.name ||
      userData.contact_person ||
      userData.contact_email ||
      userData.contact_phone ||
      `User ${Date.now()}`,

    phone: userData.contact_phone || userData.phone || null,
    email: userData.contact_email || null,

    role: userData.role || "tenant", // ✅ Fixed: default tenant

    mobile_verified: 0,
    owner_verification_status: "pending",
    created_at: new Date()
  };

  const [result] = await db.query("INSERT INTO users SET ?", newUser);

  return result.insertId;
};

/* ================= UPDATE PG STATUS ================= */
exports.updatePGStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    console.log(`Updating PG ${id} status to: ${status}`);

    const allowedStatuses = ["active", "inactive", "closed", "pending", "rejected"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value"
      });
    }

    // 1️⃣ Update PG status
    const [updateResult] = await db.query(
      "UPDATE pgs SET status = ? WHERE id = ?",
      [status, id]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "PG not found" });
    }

    // 2️⃣ Get owner ID
    const [ownerRows] = await db.query(
      `SELECT u.id, u.firebase_uid
       FROM pgs p
       JOIN users u ON u.id = p.owner_id
       WHERE p.id = ?`,
      [id]
    );

    if (ownerRows.length === 0) {
      return res.json({ success: true, status });
    }

    const ownerId = ownerRows[0].id;
    const firebaseUid = ownerRows[0].firebase_uid;

    let title = "";
    let message = "";
    let type = "";

    if (status === "active") {
      title = "PG Approved 🎉";
      message = "Your PG has been approved and is now live.";
      type = "pg_approved";
    } else if (status === "rejected") {
      title = "PG Rejected ⚠️";
      message = "Your PG was rejected. Please review admin feedback.";
      type = "pg_rejected";
    } else {
      // No notification for other status changes
      return res.json({ success: true, status });
    }

    // 3️⃣ Insert notification
    await db.query(
      `INSERT INTO notifications 
       (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [ownerId, title, message, type]
    );
    
    console.log(`✅ Notification sent to owner: ${firebaseUid || ownerId}`);
    res.json({ success: true, status });

  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= UPLOAD PHOTOS ONLY ================= */
exports.uploadPhotosOnly = async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files || [];

    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No photos uploaded"
      });
    }

    // ✅ FIXED: Use Cloudinary path, not local path
    const newPhotos = files.map(f => f.path);

    // 🔥 FIXED: Added owner_id check for security
    const [rows] = await db.query(
      "SELECT photos FROM pgs WHERE id = ? AND owner_id = ? AND is_deleted = 0",
      [id, req.user.mysqlId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "PG not found or unauthorized" });
    }

    const existing = safeParsePhotos(rows[0].photos);
    const updatedPhotos = [...existing, ...newPhotos];

    // Update database
    await db.query(
      "UPDATE pgs SET photos = ? WHERE id = ? AND owner_id = ?",
      [JSON.stringify(updatedPhotos), id, req.user.mysqlId]
    );

    res.json({
      success: true,
      message: "Photos uploaded successfully",
      photos: updatedPhotos
    });

  } catch (err) {
    console.error("Photo upload error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to save photos: " + err.message 
    });
  }
};

/* ================= ADD PG ================= */
exports.addPG = async (req, res) => {
  try {
    const b = req.body;
    console.log('Add PG request body:', b);

    // 🔐 OWNER MUST COME FROM JWT
    const numericOwnerId = req.user.mysqlId;   // ✅ MySQL user id
    const firebaseUid = req.user.uid;          // ✅ only for notifications

    console.log('Got numeric user ID:', numericOwnerId);

    if (!numericOwnerId || !b.pg_name || !b.address || !b.contact_phone || !b.city) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing (city required)"
      });
    }

    // ✅ Phone validation
    if (!/^[0-9]{10,15}$/.test(b.contact_phone)) {
      return res.status(400).json({
        success: false,
        message: "Enter valid contact phone number"
      });
    }

    // ✅ FIXED: Use Cloudinary path, not local path
    const photos = (req.files || []).map(f => f.path);

    let rent_amount = 0;
    if (b.pg_category === "to_let") {
      rent_amount = Math.min(
        Number(b.price_1bhk || 999999),
        Number(b.price_2bhk || 999999),
        Number(b.price_3bhk || 999999),
        Number(b.price_4bhk || 999999)
      );
    } else if (b.pg_category === "coliving") {
      rent_amount = Math.min(
        Number(b.co_living_single_room || 999999),
        Number(b.co_living_double_room || 999999)
      );
    } else {
      rent_amount = Math.min(
        Number(b.single_sharing || 999999),
        Number(b.double_sharing || 999999),
        Number(b.triple_sharing || 999999),
        Number(b.four_sharing || 999999),
        Number(b.single_room || 999999),
        Number(b.double_room || 999999)
      );
    }

    const pgData = {
      owner_id: numericOwnerId,
      pg_name: b.pg_name,
      pg_code: "PG" + Math.floor(100000 + Math.random() * 900000),
      location: b.address,
      address: b.address,
      area: b.area,
      city: b.city,
      road: b.road,
      landmark: b.landmark,
      latitude: b.latitude || null,
      longitude: b.longitude || null,
      pg_type: b.pg_type,
      pg_category: b.pg_category,
      rent_amount,
      deposit_amount: Number(b.security_deposit || 0),
      maintenance_amount: Number(b.maintenance_amount || 0),
      brokerage_amount: Number(b.brokerage_amount || 0),
      bhk_type: b.pg_category === "to_let" ? b.bhk_type : null,
      furnishing_type: b.pg_category === "to_let" ? b.furnishing_type : null,
      price_1bhk: b.price_1bhk ? Number(b.price_1bhk) : null,
      price_2bhk: b.price_2bhk ? Number(b.price_2bhk) : null,
      price_3bhk: b.price_3bhk ? Number(b.price_3bhk) : null,
      price_4bhk: b.price_4bhk ? Number(b.price_4bhk) : null,
      bedrooms_1bhk: b.bedrooms_1bhk ? Number(b.bedrooms_1bhk) : null,
      bathrooms_1bhk: b.bathrooms_1bhk ? Number(b.bathrooms_1bhk) : null,
      bedrooms_2bhk: b.bedrooms_2bhk ? Number(b.bedrooms_2bhk) : null,
      bathrooms_2bhk: b.bathrooms_2bhk ? Number(b.bathrooms_2bhk) : null,
      bedrooms_3bhk: b.bedrooms_3bhk ? Number(b.bedrooms_3bhk) : null,
      bathrooms_3bhk: b.bathrooms_3bhk ? Number(b.bathrooms_3bhk) : null,
      bedrooms_4bhk: b.bedrooms_4bhk ? Number(b.bedrooms_4bhk) : null,
      bathrooms_4bhk: b.bathrooms_4bhk ? Number(b.bathrooms_4bhk) : null,
      notice_period: Number(b.notice_period || 1),
      single_sharing: b.single_sharing ? Number(b.single_sharing) : null,
      double_sharing: b.double_sharing ? Number(b.double_sharing) : null,
      triple_sharing: b.triple_sharing ? Number(b.triple_sharing) : null,
      four_sharing: b.four_sharing ? Number(b.four_sharing) : null,
      single_room: b.single_room ? Number(b.single_room) : null,
      double_room: b.double_room ? Number(b.double_room) : null,
      triple_room: b.triple_room ? Number(b.triple_room) : null,
      co_living_single_room: b.co_living_single_room ? Number(b.co_living_single_room) : null,
      co_living_double_room: b.co_living_double_room ? Number(b.co_living_double_room) : null,
      food_available: toBool(b.food_available),
      food_type: b.food_type || 'veg',
      meals_per_day: b.meals_per_day || null,
      ac_available: toBool(b.ac_available),
      wifi_available: toBool(b.wifi_available),
      tv: toBool(b.tv),
      parking_available: toBool(b.parking_available),
      bike_parking: toBool(b.bike_parking),
      laundry_available: toBool(b.laundry_available),
      washing_machine: toBool(b.washing_machine),
      refrigerator: toBool(b.refrigerator),
      microwave: toBool(b.microwave),
      geyser: toBool(b.geyser),
      power_backup: toBool(b.power_backup),
      lift_elevator: toBool(b.lift_elevator),
      cctv: toBool(b.cctv),
      security_guard: toBool(b.security_guard),
      gym: toBool(b.gym),
      housekeeping: toBool(b.housekeeping),
      water_purifier: toBool(b.water_purifier),
      fire_safety: toBool(b.fire_safety),
      study_room: toBool(b.study_room),
      common_tv_lounge: toBool(b.common_tv_lounge),
      balcony_open_space: toBool(b.balcony_open_space),
      water_24x7: toBool(b.water_24x7),
      water_type: b.water_type || 'borewell',
      cupboard_available: toBool(b.cupboard_available),
      table_chair_available: toBool(b.table_chair_available),
      dining_table_available: toBool(b.dining_table_available),
      attached_bathroom: toBool(b.attached_bathroom),
      balcony_available: toBool(b.balcony_available),
      wall_mounted_clothes_hook: toBool(b.wall_mounted_clothes_hook),
      bed_with_mattress: toBool(b.bed_with_mattress),
      fan_light: toBool(b.fan_light),
      kitchen_room: toBool(b.kitchen_room),
      co_living_fully_furnished: b.pg_category === "coliving" ? 1 : 0,
      co_living_food_included: b.pg_category === "coliving" ? 1 : 0,
      co_living_wifi_included: b.pg_category === "coliving" ? 1 : 0,
      co_living_housekeeping: b.pg_category === "coliving" ? 1 : 0,
      co_living_power_backup: b.pg_category === "coliving" ? 1 : 0,
      co_living_maintenance: b.pg_category === "coliving" ? 1 : 0,
      visitor_allowed: toBool(b.visitor_allowed),
      visitor_time_restricted: toBool(b.visitor_time_restricted),
      visitors_allowed_till: b.visitors_allowed_till || null,
      couple_allowed: toBool(b.couple_allowed),
      family_allowed: b.pg_category === "to_let" ? toBool(b.family_allowed) : 0,
      smoking_allowed: toBool(b.smoking_allowed),
      drinking_allowed: toBool(b.drinking_allowed),
      pets_allowed: toBool(b.pets_allowed),
      late_night_entry_allowed: toBool(b.late_night_entry_allowed),
      entry_curfew_time: b.entry_curfew_time || null,
      outside_food_allowed: toBool(b.outside_food_allowed),
      parties_allowed: toBool(b.parties_allowed),
      loud_music_restricted: toBool(b.loud_music_restricted),
      lock_in_period: toBool(b.lock_in_period),
      min_stay_months: Number(b.min_stay_months || 0),
      agreement_mandatory: b.pg_category === "to_let" ? 1 : toBool(b.agreement_mandatory),
      id_proof_mandatory: toBool(b.id_proof_mandatory),
      office_going_only: toBool(b.office_going_only),
      students_only: toBool(b.students_only),
      boys_only: b.pg_type === 'boys' ? 1 : 0,
      girls_only: b.pg_type === 'girls' ? 1 : 0,
      co_living_allowed: b.pg_type === 'coliving' ? 1 : 0,
      subletting_allowed: toBool(b.subletting_allowed),
      nearby_college: b.nearby_college || null,
      nearby_school: b.nearby_school || null,
      nearby_it_park: b.nearby_it_park || null,
      nearby_office_hub: b.nearby_office_hub || null,
      nearby_metro: b.nearby_metro || null,
      nearby_bus_stop: b.nearby_bus_stop || null,
      nearby_railway_station: b.nearby_railway_station || null,
      distance_main_road: b.distance_main_road || null,
      nearby_hospital: b.nearby_hospital || null,
      nearby_clinic: b.nearby_clinic || null,
      nearby_pharmacy: b.nearby_pharmacy || null,
      nearby_supermarket: b.nearby_supermarket || null,
      nearby_grocery_store: b.nearby_grocery_store || null,
      nearby_restaurant: b.nearby_restaurant || null,
      nearby_mall: b.nearby_mall || null,
      nearby_bank: b.nearby_bank || null,
      nearby_atm: b.nearby_atm || null,
      nearby_post_office: b.nearby_post_office || null,
      nearby_gym: b.nearby_gym || null,
      nearby_park: b.nearby_park || null,
      nearby_temple: b.nearby_temple || null,
      nearby_mosque: b.nearby_mosque || null,
      nearby_church: b.nearby_church || null,
      nearby_police_station: b.nearby_police_station || null,
      total_rooms: Number(b.total_rooms || 0),
      available_rooms: Number(b.available_rooms || 0),
      description: b.description,
      contact_person: b.contact_person,
      contact_email: b.contact_email || null,
      contact_phone: b.contact_phone,
      photos: JSON.stringify(photos),
      videos: JSON.stringify([]),
      status: "pending",
      is_deleted: 0
    };

    console.log('Inserting PG data...');

    const [result] = await db.query("INSERT INTO pgs SET ?", pgData);

    // Send notification
    await db.query(
      `INSERT INTO notifications 
       (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [numericOwnerId, "PG Submitted", "Your PG has been submitted and is under admin verification.", "pg_added"]
    );
    
    console.log(`✅ PG Submitted notification sent to owner: ${numericOwnerId}`);

    res.json({
      success: true,
      message: "Property created successfully",
      pg_id: result.insertId
    });

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/* ================= GET PG BY ID ================= */
exports.getPGById = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM pgs WHERE id = ? AND is_deleted = 0",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "PG not found" });
    }

    const pg = rows[0];

    const boolFields = [
      "food_available", "ac_available", "wifi_available", "tv",
      "parking_available", "bike_parking", "laundry_available",
      "washing_machine", "refrigerator", "microwave", "geyser",
      "power_backup", "lift_elevator", "cctv", "security_guard",
      "gym", "housekeeping", "water_purifier", "fire_safety",
      "study_room", "common_tv_lounge", "balcony_open_space",
      "water_24x7",
      "cupboard_available", "table_chair_available", "dining_table_available",
      "attached_bathroom", "balcony_available",
      "wall_mounted_clothes_hook", "bed_with_mattress",
      "fan_light", "kitchen_room",
      "co_living_fully_furnished", "co_living_food_included",
      "co_living_wifi_included", "co_living_housekeeping",
      "co_living_power_backup", "co_living_maintenance",
      "visitor_allowed", "visitor_time_restricted", "couple_allowed",
      "family_allowed", "smoking_allowed", "drinking_allowed",
      "pets_allowed", "late_night_entry_allowed", "outside_food_allowed",
      "parties_allowed", "loud_music_restricted", "lock_in_period",
      "agreement_mandatory", "id_proof_mandatory", "office_going_only",
      "students_only", "boys_only", "girls_only", "co_living_allowed",
      "subletting_allowed"
    ];

    boolFields.forEach(key => {
      if (pg.hasOwnProperty(key)) {
        pg[key] = pg[key] === 1;
      }
    });

    normalizePrices(pg);
    pg.photos = safeParsePhotos(pg.photos);
    
    try {
      pg.videos = JSON.parse(pg.videos || "[]");
    } catch {
      pg.videos = [];
    }

    res.json({ success: true, data: pg });

  } catch (err) {
    console.error("Error fetching PG:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= SEARCH PG ================= */
exports.advancedSearchPG = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM pgs WHERE is_deleted = 0 AND status = 'active'"
    );

    const data = rows.map(pg => {
      pg.photos = safeParsePhotos(pg.photos);
      normalizePrices(pg);

      const boolFields = [
        "food_available", "ac_available", "wifi_available", "tv",
        "parking_available", "bike_parking", "laundry_available",
        "washing_machine", "refrigerator", "microwave", "geyser",
        "power_backup", "lift_elevator", "cctv", "security_guard",
        "gym", "housekeeping", "water_purifier", "fire_safety",
        "study_room", "common_tv_lounge", "balcony_open_space",
        "water_24x7",
        "cupboard_available", "table_chair_available", "dining_table_available",
        "attached_bathroom", "balcony_available",
        "wall_mounted_clothes_hook", "bed_with_mattress",
        "fan_light", "kitchen_room",
        "co_living_fully_furnished", "co_living_food_included",
        "co_living_wifi_included", "co_living_housekeeping",
        "co_living_power_backup", "co_living_maintenance",
        "visitor_allowed", "couple_allowed", "smoking_allowed",
        "drinking_allowed", "family_allowed"
      ];

      boolFields.forEach(k => {
        pg[k] = pg[k] === 1;
      });

      return pg;
    });

    res.json({ success: true, data });

  } catch (err) {
    console.error("advancedSearchPG error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= UPDATE PG ================= */
exports.updatePG = async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const files = req.files || [];

    // 🔥 FIXED: Check if PG belongs to this owner
    const [checkRows] = await db.query(
      "SELECT id FROM pgs WHERE id = ? AND owner_id = ? AND is_deleted = 0",
      [id, req.user.mysqlId]
    );

    if (checkRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "PG not found or you don't have permission to update it" 
      });
    }

    const priceFields = [
      b.single_sharing, b.double_sharing, b.triple_sharing,
      b.four_sharing, b.single_room, b.double_room,
      b.price_1bhk, b.price_2bhk, b.price_3bhk, b.price_4bhk,
      b.co_living_single_room, b.co_living_double_room
    ];

    const hasPriceUpdate = priceFields.some(v => v !== undefined && v !== "");

    let rent_amount;

    if (hasPriceUpdate) {
      const cleanNums = (arr) =>
        arr.filter(v => v !== undefined && v !== null && v !== "")
           .map(Number);

      if (b.pg_category === "to_let") {
        const prices = cleanNums([
          b.price_1bhk, b.price_2bhk, b.price_3bhk, b.price_4bhk
        ]);
        rent_amount = prices.length ? Math.min(...prices) : undefined;

      } else if (b.pg_category === "coliving") {
        const prices = cleanNums([
          b.co_living_single_room, b.co_living_double_room
        ]);
        rent_amount = prices.length ? Math.min(...prices) : undefined;

      } else {
        const prices = cleanNums([
          b.single_sharing, b.double_sharing, b.triple_sharing,
          b.four_sharing, b.single_room, b.double_room
        ]);
        rent_amount = prices.length ? Math.min(...prices) : undefined;
      }
    }

    const updateData = {
      pg_name: b.pg_name,
      location: b.address,
      address: b.address,
      area: b.area,
      city: b.city,
      road: b.road,
      landmark: b.landmark,
      pg_type: b.pg_type,
      pg_category: b.pg_category,
      deposit_amount: Number(b.deposit_amount || 0),
      maintenance_amount: Number(b.maintenance_amount || 0),
      brokerage_amount: Number(b.brokerage_amount || 0),
      bhk_type: b.bhk_type || null,
      furnishing_type: b.furnishing_type || null,
      price_1bhk: b.price_1bhk ? Number(b.price_1bhk) : null,
      price_2bhk: b.price_2bhk ? Number(b.price_2bhk) : null,
      price_3bhk: b.price_3bhk ? Number(b.price_3bhk) : null,
      price_4bhk: b.price_4bhk ? Number(b.price_4bhk) : null,
      bedrooms_1bhk: b.bedrooms_1bhk ? Number(b.bedrooms_1bhk) : null,
      bathrooms_1bhk: b.bathrooms_1bhk ? Number(b.bathrooms_1bhk) : null,
      bedrooms_2bhk: b.bedrooms_2bhk ? Number(b.bedrooms_2bhk) : null,
      bathrooms_2bhk: b.bathrooms_2bhk ? Number(b.bathrooms_2bhk) : null,
      bedrooms_3bhk: b.bedrooms_3bhk ? Number(b.bedrooms_3bhk) : null,
      bathrooms_3bhk: b.bathrooms_3bhk ? Number(b.bathrooms_3bhk) : null,
      bedrooms_4bhk: b.bedrooms_4bhk ? Number(b.bedrooms_4bhk) : null,
      bathrooms_4bhk: b.bathrooms_4bhk ? Number(b.bathrooms_4bhk) : null,
      single_sharing: b.single_sharing ? Number(b.single_sharing) : null,
      double_sharing: b.double_sharing ? Number(b.double_sharing) : null,
      triple_sharing: b.triple_sharing ? Number(b.triple_sharing) : null,
      four_sharing: b.four_sharing ? Number(b.four_sharing) : null,
      single_room: b.single_room ? Number(b.single_room) : null,
      double_room: b.double_room ? Number(b.double_room) : null,
      triple_room: b.triple_room ? Number(b.triple_room) : null,
      co_living_single_room: b.co_living_single_room ? Number(b.co_living_single_room) : null,
      co_living_double_room: b.co_living_double_room ? Number(b.co_living_double_room) : null,
      food_available: toBool(b.food_available),
      food_type: b.food_type || 'veg',
      meals_per_day: b.meals_per_day || null,
      ac_available: toBool(b.ac_available),
      wifi_available: toBool(b.wifi_available),
      tv: toBool(b.tv),
      parking_available: toBool(b.parking_available),
      bike_parking: toBool(b.bike_parking),
      laundry_available: toBool(b.laundry_available),
      washing_machine: toBool(b.washing_machine),
      refrigerator: toBool(b.refrigerator),
      microwave: toBool(b.microwave),
      geyser: toBool(b.geyser),
      power_backup: toBool(b.power_backup),
      lift_elevator: toBool(b.lift_elevator),
      cctv: toBool(b.cctv),
      security_guard: toBool(b.security_guard),
      gym: toBool(b.gym),
      housekeeping: toBool(b.housekeeping),
      water_purifier: toBool(b.water_purifier),
      fire_safety: toBool(b.fire_safety),
      study_room: toBool(b.study_room),
      common_tv_lounge: toBool(b.common_tv_lounge),
      balcony_open_space: toBool(b.balcony_open_space),
      water_24x7: toBool(b.water_24x7),
      water_type: b.water_type || 'borewell',
      cupboard_available: toBool(b.cupboard_available),
      table_chair_available: toBool(b.table_chair_available),
      dining_table_available: toBool(b.dining_table_available),
      attached_bathroom: toBool(b.attached_bathroom),
      balcony_available: toBool(b.balcony_available),
      wall_mounted_clothes_hook: toBool(b.wall_mounted_clothes_hook),
      bed_with_mattress: toBool(b.bed_with_mattress),
      fan_light: toBool(b.fan_light),
      kitchen_room: toBool(b.kitchen_room),
      co_living_fully_furnished: b.pg_category === "coliving" ? 1 : 0,
      co_living_food_included: b.pg_category === "coliving" ? 1 : 0,
      co_living_wifi_included: b.pg_category === "coliving" ? 1 : 0,
      co_living_housekeeping: b.pg_category === "coliving" ? 1 : 0,
      co_living_power_backup: b.pg_category === "coliving" ? 1 : 0,
      co_living_maintenance: b.pg_category === "coliving" ? 1 : 0,
      visitor_allowed: toBool(b.visitor_allowed),
      visitor_time_restricted: toBool(b.visitor_time_restricted),
      visitors_allowed_till: b.visitors_allowed_till || null,
      couple_allowed: toBool(b.couple_allowed),
      family_allowed: b.pg_category === "to_let" ? toBool(b.family_allowed) : 0,
      smoking_allowed: toBool(b.smoking_allowed),
      drinking_allowed: toBool(b.drinking_allowed),
      pets_allowed: toBool(b.pets_allowed),
      late_night_entry_allowed: toBool(b.late_night_entry_allowed),
      entry_curfew_time: b.entry_curfew_time || null,
      outside_food_allowed: toBool(b.outside_food_allowed),
      parties_allowed: toBool(b.parties_allowed),
      loud_music_restricted: toBool(b.loud_music_restricted),
      lock_in_period: toBool(b.lock_in_period),
      min_stay_months: Number(b.min_stay_months || 0),
      notice_period: Number(b.notice_period || 1),
      agreement_mandatory: b.pg_category === "to_let" ? 1 : toBool(b.agreement_mandatory),
      id_proof_mandatory: toBool(b.id_proof_mandatory),
      office_going_only: toBool(b.office_going_only),
      students_only: toBool(b.students_only),
      boys_only: b.pg_type === 'boys' ? 1 : 0,
      girls_only: b.pg_type === 'girls' ? 1 : 0,
      co_living_allowed: b.pg_type === 'coliving' ? 1 : 0,
      subletting_allowed: toBool(b.subletting_allowed),
      nearby_college: b.nearby_college || null,
      nearby_school: b.nearby_school || null,
      nearby_it_park: b.nearby_it_park || null,
      nearby_office_hub: b.nearby_office_hub || null,
      nearby_metro: b.nearby_metro || null,
      nearby_bus_stop: b.nearby_bus_stop || null,
      nearby_railway_station: b.nearby_railway_station || null,
      distance_main_road: b.distance_main_road || null,
      nearby_hospital: b.nearby_hospital || null,
      nearby_clinic: b.nearby_clinic || null,
      nearby_pharmacy: b.nearby_pharmacy || null,
      nearby_supermarket: b.nearby_supermarket || null,
      nearby_grocery_store: b.nearby_grocery_store || null,
      nearby_restaurant: b.nearby_restaurant || null,
      nearby_mall: b.nearby_mall || null,
      nearby_bank: b.nearby_bank || null,
      nearby_atm: b.nearby_atm || null,
      nearby_post_office: b.nearby_post_office || null,
      nearby_gym: b.nearby_gym || null,
      nearby_park: b.nearby_park || null,
      nearby_temple: b.nearby_temple || null,
      nearby_mosque: b.nearby_mosque || null,
      nearby_church: b.nearby_church || null,
      nearby_police_station: b.nearby_police_station || null,
      total_rooms: Number(b.total_rooms || 0),
      available_rooms: Number(b.available_rooms || 0),
      description: b.description,
      contact_person: b.contact_person,
      contact_email: b.contact_email || null,
      contact_phone: b.contact_phone
    };

    if (rent_amount !== undefined) {
      updateData.rent_amount = rent_amount;
    }

    // Handle photo updates if new files are uploaded
    if (files.length > 0) {
      // ✅ FIXED: Use Cloudinary path
      const newPhotos = files.map(f => f.path);

      const [rows] = await db.query(
        "SELECT photos FROM pgs WHERE id = ? AND owner_id = ?",
        [id, req.user.mysqlId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: "PG not found" });
      }

      const existing = safeParsePhotos(rows[0].photos);
      updateData.photos = JSON.stringify([...existing, ...newPhotos]);
    }

    // 🔥 FIXED: Added owner_id check in WHERE clause
    const [updateResult] = await db.query(
      "UPDATE pgs SET ? WHERE id = ? AND owner_id = ? AND is_deleted = 0",
      [updateData, id, req.user.mysqlId]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "PG not found or unauthorized" });
    }

    res.json({ success: true, message: "Property updated successfully" });

  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= OWNER DASHBOARD ================= */
exports.getOwnerDashboardPGs = async (req, res) => {
  try {
    const userId = req.user.mysqlId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    // 🔥 IMPROVED: Better dashboard query with booking count
    const [rows] = await db.query(
      `
      SELECT 
        p.*,
        COUNT(b.id) AS total_bookings
      FROM pgs p
      LEFT JOIN bookings b ON b.pg_id = p.id
      WHERE p.owner_id = ?
        AND p.is_deleted = 0
      GROUP BY p.id
      ORDER BY p.created_at DESC
      `,
      [userId]
    );

    const data = rows.map(pg => {
      pg.photos = safeParsePhotos(pg.photos);
      pg.videos = safeParsePhotos(pg.videos);
      normalizePrices(pg);

      const boolFields = [
        "cupboard_available",
        "table_chair_available",
        "dining_table_available",
        "attached_bathroom",
        "balcony_available",
        "wall_mounted_clothes_hook",
        "bed_with_mattress",
        "fan_light",
        "kitchen_room",
        "food_available",
        "ac_available",
        "wifi_available",
        "parking_available",
        "laundry_available"
      ];

      boolFields.forEach(k => {
        if (pg.hasOwnProperty(k)) {
          pg[k] = pg[k] === 1;
        }
      });

      pg.status = pg.status || "active";
      return pg;
    });

    res.json({
      success: true,
      data,
      count: data.length
    });

  } catch (err) {
    console.error("Error fetching owner dashboard:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

/* ================= DELETE PG ================= */
exports.deletePG = async (req, res) => {
  try {
    // 🔥 FIXED: Added owner_id check
    const [result] = await db.query(
      "UPDATE pgs SET is_deleted = 1 WHERE id = ? AND owner_id = ?",
      [req.params.id, req.user.mysqlId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "PG not found or you don't have permission to delete it" 
      });
    }

    res.json({ success: true, message: "PG deleted" });

  } catch (err) {
    console.error("Error deleting PG:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= JOIN PG ================= */
exports.joinPG = async (req, res) => {
  try {
    const { pg_id } = req.body;

    if (!pg_id) {
      return res.status(400).json({ success: false, message: "PG ID required" });
    }

    const numericUserId = req.user.mysqlId;

    // 🔥 FIXED: Prevent duplicate join requests
    await db.query(
      `INSERT INTO pg_users (user_id, pg_id, status)
       SELECT ?, ?, 'PENDING'
       WHERE NOT EXISTS (
         SELECT 1 FROM pg_users WHERE user_id = ? AND pg_id = ?
       )`,
      [numericUserId, pg_id, numericUserId, pg_id]
    );

    res.json({ success: true, message: "Join request sent" });

  } catch (err) {
    console.error("Error joining PG:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= DELETE SINGLE PHOTO ================= */
exports.deleteSinglePhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const { photo } = req.body;

    // 🔥 FIXED: Added owner_id check
    const [rows] = await db.query(
      "SELECT photos FROM pgs WHERE id = ? AND owner_id = ?", 
      [id, req.user.mysqlId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "PG not found or unauthorized" });
    }

    let photos = safeParsePhotos(rows[0].photos);
    photos = photos.filter(p => p !== photo);

    await db.query(
      "UPDATE pgs SET photos = ? WHERE id = ? AND owner_id = ?",
      [JSON.stringify(photos), id, req.user.mysqlId]
    );

    // ✅ REMOVED: Don't try to delete from local filesystem with Cloudinary
    // Files are on Cloudinary, not local server

    res.json({ success: true, photos });

  } catch (err) {
    console.error("Error deleting photo:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= UPDATE PHOTO ORDER ================= */
exports.updatePhotoOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { photos } = req.body;

    // 🔥 FIXED: Added owner_id check
    const [result] = await db.query(
      "UPDATE pgs SET photos = ? WHERE id = ? AND owner_id = ?",
      [JSON.stringify(photos), id, req.user.mysqlId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "PG not found or unauthorized" });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Error updating photo order:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= UPLOAD PG VIDEOS ================= */
exports.uploadPGVideos = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No videos uploaded"
      });
    }

    // ✅ FIXED: Use Cloudinary path
    const newVideos = req.files.map(file => file.path);

    // 🔥 FIXED: Added owner_id check
    const [rows] = await db.query(
      "SELECT videos FROM pgs WHERE id = ? AND owner_id = ?",
      [id, req.user.mysqlId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "PG not found or unauthorized" });
    }

    let existing = [];
    try {
      existing = JSON.parse(rows[0].videos || "[]");
    } catch {
      existing = [];
    }

    const updatedVideos = [...existing, ...newVideos];

    await db.query(
      "UPDATE pgs SET videos = ? WHERE id = ? AND owner_id = ?",
      [JSON.stringify(updatedVideos), id, req.user.mysqlId]
    );

    res.json({
      success: true,
      videos: updatedVideos
    });

  } catch (err) {
    console.error("Error uploading videos:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= GET NEARBY PGs ================= */
exports.getNearbyPGs = async (req, res) => {
  try {
    const { lat, lng } = req.params;
    const { radius = 5, exclude = null } = req.query;
    
    console.log("Fetching nearby PGs for:", lat, lng, "exclude:", exclude);
    
    if (!lat || !lng) {
      return res.status(400).json({ 
        success: false, 
        message: "Latitude and longitude are required" 
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusKm = parseFloat(radius);

    let query = `
      SELECT *, 
        (6371 * acos(
          cos(radians(?)) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians(?)) + 
          sin(radians(?)) * sin(radians(latitude))
        )) AS distance
      FROM pgs 
      WHERE is_deleted = 0 
        AND status = 'active'
        AND latitude IS NOT NULL 
        AND longitude IS NOT NULL
    `;

    let queryParams = [latitude, longitude, latitude];

    if (exclude && exclude !== 'undefined') {
      query += ' AND id != ?';
      queryParams.push(parseInt(exclude));
    }

    query += ' HAVING distance < ? ORDER BY distance ASC LIMIT 10';
    queryParams.push(radiusKm);

    console.log("Query params:", queryParams);

    const [rows] = await db.query(query, queryParams);

    console.log(`Found ${rows.length} nearby PGs`);

    const nearbyPGs = rows.map(pg => {
      pg.photos = safeParsePhotos(pg.photos);
      normalizePrices(pg);
      
      const boolFields = [
        "food_available", "ac_available", "wifi_available",
        "parking_available", "cctv", "laundry_available"
      ];
      
      boolFields.forEach(k => {
        pg[k] = pg[k] === 1;
      });
      
      return pg;
    });

    res.json({ 
      success: true, 
      data: nearbyPGs,
      count: nearbyPGs.length,
      radius: radiusKm
    });

  } catch (err) {
    console.error("Nearby PGs query error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/* ================= DELETE SINGLE VIDEO ================= */
exports.deleteSingleVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const { video } = req.body;

    if (!video) {
      return res.status(400).json({ success: false, message: "Video required" });
    }

    // 🔥 FIXED: Added owner_id check
    const [rows] = await db.query(
      "SELECT videos FROM pgs WHERE id = ? AND owner_id = ?", 
      [id, req.user.mysqlId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "PG not found or unauthorized" });
    }

    let videos = [];
    try {
      videos = JSON.parse(rows[0].videos || "[]");
    } catch {
      videos = [];
    }

    const updatedVideos = videos.filter(v => v !== video);

    // ✅ REMOVED: Don't try to delete from local filesystem with Cloudinary

    await db.query(
      "UPDATE pgs SET videos = ? WHERE id = ? AND owner_id = ?",
      [JSON.stringify(updatedVideos), id, req.user.mysqlId]
    );

    res.json({ success: true, videos: updatedVideos });

  } catch (err) {
    console.error("Error deleting video:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= CREATE USER ================= */
exports.createUser = async (req, res) => {
  try {
    const { firebase_uid, name, email, phone, role = 'tenant' } = req.body; // 🔥 FIXED: default tenant

    if (!firebase_uid || !name) {
      return res.status(400).json({
        success: false,
        message: "Firebase UID and name are required"
      });
    }

    const userData = {
      firebase_uid,
      name,
      email: email || null,
      phone: phone || null,
      role: role || "tenant", // 🔥 FIXED: default tenant
      mobile_verified: 0,
      owner_verification_status: 'pending',
      created_at: new Date()
    };

    const [result] = await db.query('INSERT INTO users SET ?', userData);

    res.json({
      success: true,
      message: "User created successfully",
      user_id: result.insertId
    });

  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/* ================= GET USER BY FIREBASE UID ================= */
exports.getUserByFirebaseUid = async (req, res) => {
  try {
    const { firebaseUid } = req.params;

    const [rows] = await db.query(
      'SELECT * FROM users WHERE firebase_uid = ?',
      [firebaseUid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({ success: true, data: rows[0] });

  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= CLEAN INVALID NOTIFICATIONS ================= */
exports.cleanInvalidNotifications = async (req, res) => {
  try {
    // Delete notifications with numeric user_ids (these are invalid)
    const [result] = await db.query(
      "DELETE FROM notifications WHERE user_id REGEXP '^[0-9]+$'"
    );

    res.json({
      success: true,
      message: `Deleted ${result.affectedRows} invalid notifications`,
      deleted_count: result.affectedRows
    });

  } catch (err) {
    console.error("Error cleaning notifications:", err);
    res.status(500).json({
      success: false,
      message: "Failed to clean notifications: " + err.message
    });
  }
};

exports.becomeOwner = async (req, res) => {
  try {
    const userId = req.user.mysqlId;

    await db.query(
      "UPDATE users SET role = 'owner' WHERE id = ?",
      [userId]
    );

    res.json({
      success: true,
      message: "You are now an owner"
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};