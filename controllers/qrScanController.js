const db = require("../db");

/* ================= SAFE PARSE PHOTOS HELPER ================= */
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

/* ================= SAFE PARSE VIDEOS HELPER ================= */
const safeParseVideos = (value) => {
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

/* ================= GET PG DATA FOR QR SCAN ================= */
exports.getPGScanData = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🔍 QR Code scanned for PG ID: ${id}`);

    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid PG ID format" });
    }

    // 1. Fetch Complete PG Details with all fields
    const [pgRows] = await db.query(
      `SELECT 
        id, pg_name, pg_code, pg_type, pg_category,
        city, area, address, landmark, state, pincode, country,
        latitude, longitude,
        rent_amount, deposit_amount, security_deposit,
        status, description, rating,
        food_available, food_type, meals_per_day,
        ac_available, wifi_available, parking_available,
        laundry_available, power_backup, cctv,
        geyser, washing_machine, refrigerator,
        microwave, gym, tv,
        total_rooms, available_rooms,
        
        -- PG/Sharing prices
        single_sharing, double_sharing, triple_sharing, four_sharing,
        single_room, double_room, triple_room,
        
        -- Co-living prices
        co_living_single_room, co_living_double_room,
        
        -- To-let/BHK prices
        bhk_type, furnishing_type,
        price_1bhk, price_2bhk, price_3bhk, price_4bhk,
        bedrooms_1bhk, bathrooms_1bhk,
        bedrooms_2bhk, bathrooms_2bhk,
        bedrooms_3bhk, bathrooms_3bhk,
        bedrooms_4bhk, bathrooms_4bhk,
        
        -- Additional charges
        maintenance_amount, brokerage_amount, notice_period,
        lock_in_period, min_stay_months,
        
        -- Contact info
        contact_person, contact_email, contact_phone,
        owner_firebase_uid,
        
        -- Amenities flags
        visitor_allowed, couple_allowed, smoking_allowed,
        drinking_allowed, family_allowed, pets_allowed,
        students_only, office_going_only,
        boys_only, girls_only, co_living_allowed,
        bike_parking, lift_elevator, security_guard,
        housekeeping, water_purifier, fire_safety,
        study_room, common_tv_lounge, balcony_open_space,
        water_24x7, attached_bathroom, balcony_available,
        cupboard_available, table_chair_available,
        dining_table_available, bed_with_mattress,
        fan_light, wall_mounted_clothes_hook,
        
        -- Media
        photos, videos,
        
        -- Nearby places
        nearby_college, nearby_school, nearby_it_park,
        nearby_office_hub, nearby_metro, nearby_bus_stop,
        nearby_railway_station, nearby_hospital,
        nearby_clinic, nearby_pharmacy, nearby_supermarket,
        nearby_grocery_store, nearby_restaurant, nearby_mall,
        nearby_bank, nearby_atm, nearby_gym, nearby_park,
        nearby_temple, nearby_mosque, nearby_church,
        
        -- Timestamps
        created_at, updated_at, approved_at
        
      FROM pgs 
      WHERE id = ? AND is_deleted = 0`,
      [id]
    );

    if (pgRows.length === 0) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    const pg = pgRows[0];
    
    // Parse JSON fields
    pg.photos = safeParsePhotos(pg.photos);
    pg.videos = safeParseVideos(pg.videos);

    // 2. Structure price details based on property category
    const priceDetails = {
      // Base prices
      rent_amount: pg.rent_amount,
      deposit_amount: pg.deposit_amount,
      security_deposit: pg.security_deposit,
      maintenance_amount: pg.maintenance_amount,
      brokerage_amount: pg.brokerage_amount,
      
      // PG/Sharing prices
      sharing: {
        single_sharing: pg.single_sharing,
        double_sharing: pg.double_sharing,
        triple_sharing: pg.triple_sharing,
        four_sharing: pg.four_sharing,
        single_room: pg.single_room,
        double_room: pg.double_room,
        triple_room: pg.triple_room
      },
      
      // Co-living prices
      co_living: {
        single_room: pg.co_living_single_room,
        double_room: pg.co_living_double_room
      },
      
      // To-let/BHK prices
      to_let: {
        bhk_type: pg.bhk_type,
        furnishing_type: pg.furnishing_type,
        prices: {
          '1bhk': pg.price_1bhk,
          '2bhk': pg.price_2bhk,
          '3bhk': pg.price_3bhk,
          '4bhk': pg.price_4bhk
        },
        configurations: {
          '1bhk': {
            bedrooms: pg.bedrooms_1bhk,
            bathrooms: pg.bathrooms_1bhk
          },
          '2bhk': {
            bedrooms: pg.bedrooms_2bhk,
            bathrooms: pg.bathrooms_2bhk
          },
          '3bhk': {
            bedrooms: pg.bedrooms_3bhk,
            bathrooms: pg.bathrooms_3bhk
          },
          '4bhk': {
            bedrooms: pg.bedrooms_4bhk,
            bathrooms: pg.bathrooms_4bhk
          }
        }
      }
    };

    // 3. Structure food details
    const foodDetails = {
      food_available: pg.food_available === 1,
      food_type: pg.food_type,
      meals_per_day: pg.meals_per_day
    };

    // 4. Structure amenities
    const amenities = {
      basic: {
        wifi: pg.wifi_available === 1,
        parking: pg.parking_available === 1,
        ac: pg.ac_available === 1,
        power_backup: pg.power_backup === 1,
        cctv: pg.cctv === 1,
        security_guard: pg.security_guard === 1,
        housekeeping: pg.housekeeping === 1,
        lift: pg.lift_elevator === 1,
        bike_parking: pg.bike_parking === 1
      },
      appliances: {
        geyser: pg.geyser === 1,
        washing_machine: pg.washing_machine === 1,
        refrigerator: pg.refrigerator === 1,
        microwave: pg.microwave === 1,
        tv: pg.tv === 1,
        water_purifier: pg.water_purifier === 1
      },
      room_amenities: {
        attached_bathroom: pg.attached_bathroom === 1,
        balcony: pg.balcony_available === 1,
        cupboard: pg.cupboard_available === 1,
        table_chair: pg.table_chair_available === 1,
        dining_table: pg.dining_table_available === 1,
        bed_with_mattress: pg.bed_with_mattress === 1,
        fan_light: pg.fan_light === 1,
        wall_mounted_hook: pg.wall_mounted_clothes_hook === 1
      },
      common_areas: {
        gym: pg.gym === 1,
        study_room: pg.study_room === 1,
        common_tv_lounge: pg.common_tv_lounge === 1,
        balcony_open_space: pg.balcony_open_space === 1,
        kitchen_room: pg.kitchen_room === 1
      }
    };

    // 5. Structure rules and restrictions
    const rules = {
      visitors: {
        allowed: pg.visitor_allowed === 1,
        time_restricted: pg.visitor_time_restricted === 1,
        allowed_till: pg.visitors_allowed_till
      },
      entry: {
        late_night_allowed: pg.late_night_entry_allowed === 1,
        curfew_time: pg.entry_curfew_time
      },
      restrictions: {
        couple_allowed: pg.couple_allowed === 1,
        smoking_allowed: pg.smoking_allowed === 1,
        drinking_allowed: pg.drinking_allowed === 1,
        family_allowed: pg.family_allowed === 1,
        pets_allowed: pg.pets_allowed === 1,
        outside_food_allowed: pg.outside_food_allowed === 1,
        parties_allowed: pg.parties_allowed === 1,
        loud_music_restricted: pg.loud_music_restricted === 1
      },
      tenancy: {
        id_proof_mandatory: pg.id_proof_mandatory === 1,
        agreement_mandatory: pg.agreement_mandatory === 1,
        notice_period: pg.notice_period,
        lock_in_period: pg.lock_in_period,
        min_stay_months: pg.min_stay_months,
        subletting_allowed: pg.subletting_allowed === 1
      },
      occupant_type: {
        students_only: pg.students_only === 1,
        office_going_only: pg.office_going_only === 1,
        boys_only: pg.boys_only === 1,
        girls_only: pg.girls_only === 1,
        co_living_allowed: pg.co_living_allowed === 1
      }
    };

    // 6. Structure nearby places
    const nearbyPlaces = {
      education: {
        college: pg.nearby_college,
        school: pg.nearby_school
      },
      employment: {
        it_park: pg.nearby_it_park,
        office_hub: pg.nearby_office_hub
      },
      transport: {
        metro: pg.nearby_metro,
        bus_stop: pg.nearby_bus_stop,
        railway_station: pg.nearby_railway_station,
        distance_main_road: pg.distance_main_road
      },
      healthcare: {
        hospital: pg.nearby_hospital,
        clinic: pg.nearby_clinic,
        pharmacy: pg.nearby_pharmacy
      },
      shopping: {
        supermarket: pg.nearby_supermarket,
        grocery_store: pg.nearby_grocery_store,
        mall: pg.nearby_mall
      },
      services: {
        bank: pg.nearby_bank,
        atm: pg.nearby_atm,
        post_office: pg.nearby_post_office
      },
      recreation: {
        gym: pg.nearby_gym,
        park: pg.nearby_park,
        restaurant: pg.nearby_restaurant
      },
      religious: {
        temple: pg.nearby_temple,
        mosque: pg.nearby_mosque,
        church: pg.nearby_church
      },
      safety: {
        police_station: pg.nearby_police_station
      }
    };

    // 7. Fetch available rooms from pg_rooms table
    const [roomRows] = await db.query(
  `SELECT id, room_no, room_type, total_seats, occupied_seats, rent, deposit
   FROM pg_rooms 
   WHERE pg_id = ? AND status != 'full'
   ORDER BY rent ASC`,
  [id]
);

    // 8. Attach room data
    pg.available_room_details = roomRows.map(room => ({
      id: room.id,
      sharing_type: room.room_type,
      room_number: room.room_no,
      room_no: room.room_no,
  // ✅ ADD THIS LINE
      total_seats: room.total_seats,
      occupied_seats: room.occupied_seats,
      available_beds: room.total_seats - room.occupied_seats,
      price: room.rent,
      security_deposit: room.deposit
    }));

    // 9. Create availability summary
    const availabilitySummary = {};
    roomRows.forEach(room => {
      const type = room.room_type || "Standard";
      if (!availabilitySummary[type]) {
        availabilitySummary[type] = {
          total_beds: 0,
          available_beds: 0,
          price: room.rent
        };
      }
      availabilitySummary[type].total_beds += room.total_seats;
      availabilitySummary[type].available_beds += (room.total_seats - room.occupied_seats);
    });

    // 10. Prepare the final response
    const responseData = {
      // Basic Info
      id: pg.id,
      name: pg.pg_name,
      code: pg.pg_code,
      type: pg.pg_type,
      category: pg.pg_category,
      rating: pg.rating,
      status: pg.status,
      description: pg.description,
      
      // Location
      location: {
        city: pg.city,
        area: pg.area,
        address: pg.address,
        landmark: pg.landmark,
        state: pg.state,
        pincode: pg.pincode,
        country: pg.country,
        coordinates: {
          lat: pg.latitude,
          lng: pg.longitude
        }
      },
      
      // Price Details (Structured)
      price_details: priceDetails,
      
      // Food Details
      food_details: foodDetails,
      
      // Amenities
      amenities: amenities,
      
      // Rules
      rules: rules,
      
      // Rooms Availability
      total_rooms: pg.total_rooms,
      available_rooms: pg.available_rooms,
      available_room_details: pg.available_room_details,
      availability_summary: availabilitySummary,
      
      // Nearby Places
      nearby_places: nearbyPlaces,
      
      // Contact
      contact: {
        person: pg.contact_person,
        email: pg.contact_email,
        phone: pg.contact_phone
      },
      
      // Media
      photos: pg.photos,
      videos: pg.videos,
      
      // Metadata
      created_at: pg.created_at,
      updated_at: pg.updated_at,
      approved_at: pg.approved_at
    };

    console.log(`✅ QR scan successful. Found ${roomRows.length} available rooms.`);

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error("❌ QR SCAN ERROR:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ================= TRACK QR SCAN ================= */
exports.trackQRScan = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📊 Tracking scan for PG ID: ${id}`);

    // Validate ID
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PG ID format"
      });
    }

    // Simple success response - no database operations
    res.json({
      success: true,
      message: "Scan tracked"
    });

  } catch (error) {
    console.error("Error tracking QR scan:", error);
    res.json({
      success: true,
      message: "Scan received"
    });
  }
};

/* ================= GET SCAN STATISTICS ================= */
exports.getScanStatistics = async (req, res) => {
  try {
    const { id } = req.params;

    // Return empty stats for now
    res.json({
      success: true,
      data: {
        total_scans: 0,
        recent_scans: 0,
        daily_trend: []
      }
    });

  } catch (error) {
    console.error("Error getting scan statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get scan statistics"
    });
  }
};




exports.checkAndCheckinUser = async (req, res) => {
  try {
    const { pg_id } = req.body;
    const firebase_uid = req.user?.uid || req.user?.firebase_uid;

    // ✅ Get user
    const [userRows] = await db.query(
      `SELECT id FROM users WHERE firebase_uid = ?`,
      [firebase_uid]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user_id = userRows[0].id;

    //////////////////////////////////////////////////////
    // ✅ STEP 1: CHECK IF USER ALREADY ACTIVE
    //////////////////////////////////////////////////////
    const [activeUser] = await db.query(
      `SELECT * FROM pg_users 
       WHERE user_id = ? AND pg_id = ? AND status = 'ACTIVE'
       LIMIT 1`,
      [user_id, pg_id]
    );

    if (activeUser.length > 0) {
      return res.json({
        success: true,
        type: "ALREADY_JOINED",
        message: "✅ Already staying in this PG"
      });
    }

    //////////////////////////////////////////////////////
    // ✅ STEP 2: FIND VALID PAID BOOKING
    // (Handles TOKEN + REMAINING also)
    //////////////////////////////////////////////////////
    const [booking] = await db.query(
      `SELECT b.id 
       FROM bookings b
       WHERE b.user_id = ? 
       AND b.pg_id = ?
       AND EXISTS (
         SELECT 1 FROM payments p 
         WHERE p.booking_id = b.id 
         AND p.status = 'paid'
       )
       ORDER BY b.created_at DESC 
       LIMIT 1`,
      [user_id, pg_id]
    );

    if (booking.length === 0) {
      return res.json({
        success: false,
        type: "NOT_PAID",
        message: "❌ No paid booking found. Please pay first."
      });
    }

    const booking_id = booking[0].id;

    //////////////////////////////////////////////////////
    // ✅ STEP 3: CHECK IF ALREADY CHECKED-IN
    //////////////////////////////////////////////////////
    const [existingCheckin] = await db.query(
      `SELECT id FROM pg_checkins WHERE booking_id = ?`,
      [booking_id]
    );

    if (existingCheckin.length > 0) {
      return res.json({
        success: true,
        type: "ALREADY_JOINED",
        message: "✅ Verified"
      });
    }

    //////////////////////////////////////////////////////
    // ✅ STEP 4: SHOW CONFIRM JOIN
    //////////////////////////////////////////////////////
    return res.json({
      success: false,
      type: "CONFIRM_JOIN",
      booking_id,
      message: "⚠️ Valid booking found! Confirm to join this PG."
    });

  } catch (err) {
    console.error("🔥 CHECK-IN ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};



exports.joinPGWithRoom = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const firebase_uid = req.user?.uid || req.user?.firebase_uid;
    const { pg_id, room_id } = req.body;

    //////////////////////////////////////////////////////
    // ✅ GET USER
    //////////////////////////////////////////////////////
    const [userRows] = await connection.query(
      `SELECT id FROM users WHERE firebase_uid = ?`,
      [firebase_uid]
    );

    if (userRows.length === 0) throw new Error("User not found");

    const user_id = userRows[0].id;

    //////////////////////////////////////////////////////
    // ✅ PREVENT DOUBLE ACTIVE
    //////////////////////////////////////////////////////
    const [activeUser] = await connection.query(
      `SELECT id FROM pg_users 
       WHERE user_id = ? AND pg_id = ? AND status = 'ACTIVE'
       LIMIT 1`,
      [user_id, pg_id]
    );

    if (activeUser.length > 0) {
      await connection.rollback();
      return res.json({
        success: true,
        type: "ALREADY_JOINED",
        message: "Already staying in PG"
      });
    }

    //////////////////////////////////////////////////////
    // ✅ GET LATEST VALID PAID BOOKING
    //////////////////////////////////////////////////////
    const [booking] = await connection.query(
      `SELECT b.id, b.room_id 
       FROM bookings b
       WHERE b.user_id = ? 
       AND b.pg_id = ?
       AND EXISTS (
         SELECT 1 FROM payments p 
         WHERE p.booking_id = b.id 
         AND p.status = 'paid'
       )
       ORDER BY b.created_at DESC 
       LIMIT 1`,
      [user_id, pg_id]
    );

    if (booking.length === 0) {
      throw new Error("No paid booking found");
    }

    const booking_id = booking[0].id;
    const finalRoomId = room_id || booking[0].room_id;

    //////////////////////////////////////////////////////
    // ✅ PREVENT DUPLICATE CHECK-IN
    //////////////////////////////////////////////////////
    const [checkinExist] = await connection.query(
      `SELECT id FROM pg_checkins WHERE booking_id = ?`,
      [booking_id]
    );

    if (checkinExist.length > 0) {
      await connection.rollback();
      return res.json({
        success: true,
        type: "ALREADY_JOINED",
        message: "Already checked in"
      });
    }

    //////////////////////////////////////////////////////
    // ✅ UPDATE OR INSERT pg_users
    //////////////////////////////////////////////////////
    const [existingStay] = await connection.query(
      `SELECT id FROM pg_users 
       WHERE user_id = ? AND pg_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [user_id, pg_id]
    );

    if (existingStay.length > 0) {
      await connection.query(
        `UPDATE pg_users 
         SET booking_id = ?, 
             status = 'ACTIVE',
             room_id = ?, 
             join_date = CURDATE()
         WHERE id = ?`,
        [booking_id, finalRoomId, existingStay[0].id]
      );
    } else {
      await connection.query(
        `INSERT INTO pg_users 
         (pg_id, user_id, booking_id, room_id, status, join_date)
         VALUES (?, ?, ?, ?, 'ACTIVE', CURDATE())`,
        [pg_id, user_id, booking_id, finalRoomId]
      );
    }

    //////////////////////////////////////////////////////
    // ✅ INSERT CHECK-IN
    //////////////////////////////////////////////////////
    await connection.query(
      `INSERT INTO pg_checkins 
       (user_id, pg_id, booking_id, payment_status)
       VALUES (?, ?, ?, 'paid')`,
      [user_id, pg_id, booking_id]
    );

    await connection.commit();

    return res.json({
      success: true,
      type: "ALREADY_JOINED",
      message: "🎉 Successfully checked in!"
    });

  } catch (err) {
    await connection.rollback();
    console.error("🔥 JOIN ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message
    });

  } finally {
    connection.release();
  }
};