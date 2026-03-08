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

/* ================= GET PG DATA FOR QR SCAN ================= */
/* ================= GET PG DATA FOR QR SCAN ================= */
/* ================= GET PG DATA FOR QR SCAN - ENHANCED MODERN VERSION ================= */
exports.getPGScanData = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🔍 QR Code scanned for PG ID: ${id}`);

    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid PG ID format" });
    }

    // 1. Fetch PG Details with more comprehensive data
    const [pgRows] = await db.query(
      `SELECT 
        id, 
        pg_name, 
        pg_type, 
        pg_category,
        city, 
        area, 
        address, 
        landmark,
        latitude,
        longitude,
        rent_amount, 
        deposit_amount, 
        maintenance_amount,
        brokerage_amount,
        photos, 
        videos,
        status, 
        description,
        contact_person,
        contact_phone,
        contact_email,
        
        -- Room type specific prices
        single_sharing,
        double_sharing,
        triple_sharing,
        four_sharing,
        single_room,
        double_room,
        triple_room,
        price_1bhk,
        price_2bhk,
        price_3bhk,
        price_4bhk,
        co_living_single_room,
        co_living_double_room,
        
        -- Amenities (key ones for quick display)
        food_available,
        food_type,
        ac_available,
        wifi_available,
        parking_available,
        cctv,
        gym,
        housekeeping,
        power_backup,
        
        -- Rules
        couple_allowed,
        family_allowed,
        visitors_allowed_till,
        min_stay_months,
        notice_period,
        
        -- Ratings & Reviews
        average_rating,
        total_reviews,
        
        -- Distance metrics
        nearby_metro,
        nearby_bus_stop,
        nearby_railway_station,
        distance_main_road
        
       FROM pgs 
       WHERE id = ? AND is_deleted = 0 AND status = 'active'`,
      [id]
    );

    if (pgRows.length === 0) {
      return res.status(404).json({ success: false, message: "Property not found or inactive" });
    }

    const pg = pgRows[0];
    pg.photos = safeParsePhotos(pg.photos);
    pg.videos = safeParsePhotos(pg.videos);

    // 2. Fetch ALL Available Rooms with detailed info
    const [roomRows] = await db.query(
      `SELECT 
        id,
        room_no, 
        room_type, 
        total_seats, 
        occupied_seats, 
        rent, 
        deposit,
        floor_no,
        furnished_type,
        attached_bathroom,
        balcony_available
       FROM pg_rooms 
       WHERE pg_id = ? AND status IN ('empty', 'partial')
       ORDER BY rent ASC`,
      [id]
    );

    // 3. Fetch Facilities/Amenities (if you have a separate amenities table)
    const [amenitiesRows] = await db.query(
      `SELECT amenity_name, is_available, additional_charges
       FROM pg_amenities 
       WHERE pg_id = ?`,
      [id]
    );

    // 4. Fetch Reviews (latest 3)
    const [reviewsRows] = await db.query(
      `SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        u.name as user_name,
        u.photo as user_photo
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.pg_id = ? AND r.status = 'approved'
       ORDER BY r.created_at DESC
       LIMIT 3`,
      [id]
    );

    // 5. Process room data with modern structure
    const availableRoomDetails = roomRows.map(room => {
      const availableBeds = room.total_seats - room.occupied_seats;
      
      // Determine sharing type label
      let sharingLabel = room.room_type;
      let sharingCount = 0;
      
      if (room.room_type.toLowerCase().includes('single')) sharingCount = 1;
      else if (room.room_type.toLowerCase().includes('double')) sharingCount = 2;
      else if (room.room_type.toLowerCase().includes('triple')) sharingCount = 3;
      else if (room.room_type.toLowerCase().includes('four')) sharingCount = 4;
      
      return {
        id: room.id,
        room_number: room.room_no,
        sharing_type: room.room_type,
        sharing_count: sharingCount,
        available_beds: availableBeds,
        total_beds: room.total_seats,
        price: room.rent,
        price_per_bed: Math.round(room.rent / total_seats),
        security_deposit: room.deposit,
        floor: room.floor_no || 'Ground',
        furnished: room.furnished_type || 'Semi-Furnished',
        features: {
          attached_bathroom: room.attached_bathroom === 1,
          balcony: room.balcony_available === 1
        },
        
        // For UI display
        badge: availableBeds > 2 ? 'Multiple beds available' : 
               availableBeds === 2 ? '2 beds left' : 
               availableBeds === 1 ? 'Last bed' : '',
        
        badge_color: availableBeds === 1 ? 'red' : 
                     availableBeds === 2 ? 'orange' : 'green'
      };
    });

    // 6. Create availability summary with counts
    const availabilitySummary = {
      total_available_rooms: roomRows.length,
      total_available_beds: roomRows.reduce((sum, room) => 
        sum + (room.total_seats - room.occupied_seats), 0),
      
      by_sharing_type: {},
      by_price_range: {
        budget: { count: 0, range: 'Under ₹5000' },
        mid: { count: 0, range: '₹5000-8000' },
        premium: { count: 0, range: 'Above ₹8000' }
      }
    };

    roomRows.forEach(room => {
      const type = room.room_type || "Standard";
      const available = room.total_seats - room.occupied_seats;
      
      // By sharing type
      if (!availabilitySummary.by_sharing_type[type]) {
        availabilitySummary.by_sharing_type[type] = {
          total_beds: available,
          rooms_count: 1,
          min_price: room.rent,
          max_price: room.rent
        };
      } else {
        availabilitySummary.by_sharing_type[type].total_beds += available;
        availabilitySummary.by_sharing_type[type].rooms_count += 1;
        availabilitySummary.by_sharing_type[type].min_price = 
          Math.min(availabilitySummary.by_sharing_type[type].min_price, room.rent);
        availabilitySummary.by_sharing_type[type].max_price = 
          Math.max(availabilitySummary.by_sharing_type[type].max_price, room.rent);
      }
      
      // By price range
      if (room.rent < 5000) availabilitySummary.by_price_range.budget.count += available;
      else if (room.rent <= 8000) availabilitySummary.by_price_range.mid.count += available;
      else availabilitySummary.by_price_range.premium.count += available;
    });

    // 7. Process amenities
    const amenities = {
      basic: [],
      food: [],
      safety: [],
      premium: []
    };
    
    amenitiesRows?.forEach(a => {
      if (a.is_available) {
        const amenity = {
          name: a.amenity_name,
          charges: a.additional_charges || 0
        };
        
        // Categorize amenities
        if (['wifi', 'ac', 'fan', 'light'].includes(a.amenity_name.toLowerCase())) {
          amenities.basic.push(amenity);
        } else if (['food', 'meals', 'kitchen'].includes(a.amenity_name.toLowerCase())) {
          amenities.food.push(amenity);
        } else if (['cctv', 'guard', 'fire'].includes(a.amenity_name.toLowerCase())) {
          amenities.safety.push(amenity);
        } else {
          amenities.premium.push(amenity);
        }
      }
    });

    // 8. Build modern response structure
    const response = {
      success: true,
      data: {
        // Basic Info
        id: pg.id,
        name: pg.pg_name,
        type: pg.pg_type,
        category: pg.pg_category,
        
        // Location (for map display)
        location: {
          full_address: pg.address,
          area: pg.area,
          city: pg.city,
          landmark: pg.landmark,
          coordinates: {
            lat: pg.latitude,
            lng: pg.longitude
          },
          nearby: {
            metro: pg.nearby_metro,
            bus_stop: pg.nearby_bus_stop,
            railway: pg.nearby_railway_station,
            distance_main_road: pg.distance_main_road
          }
        },
        
        // Visual Content
        media: {
          photos: pg.photos.map((photo, index) => ({
            url: photo,
            is_primary: index === 0,
            caption: `View ${index + 1}`
          })),
          videos: pg.videos,
          photo_count: pg.photos.length
        },
        
        // Pricing Summary (for quick view)
        pricing_summary: {
          starting_from: pg.rent_amount,
          security_deposit: pg.deposit_amount,
          maintenance: pg.maintenance_amount,
          brokerage: pg.brokerage_amount,
          
          // Detailed pricing by type
          by_room_type: {
            single_sharing: pg.single_sharing,
            double_sharing: pg.double_sharing,
            triple_sharing: pg.triple_sharing,
            four_sharing: pg.four_sharing,
            single_room: pg.single_room,
            double_room: pg.double_room,
            co_living_single: pg.co_living_single_room,
            co_living_double: pg.co_living_double_room,
            bhk: {
              '1bhk': pg.price_1bhk,
              '2bhk': pg.price_2bhk,
              '3bhk': pg.price_3bhk
            }
          }
        },
        
        // Available Rooms (detailed)
        available_rooms: {
          count: roomRows.length,
          total_beds: availabilitySummary.total_available_beds,
          summary: availabilitySummary.by_sharing_type,
          price_ranges: availabilitySummary.by_price_range,
          rooms_list: availableRoomDetails
        },
        
        // Quick Stats
        stats: {
          rating: pg.average_rating || 0,
          reviews_count: pg.total_reviews || 0,
          available_now: roomRows.length > 0,
          min_stay: pg.min_stay_months,
          notice_period: pg.notice_period
        },
        
        // Amenities (categorized for modern UI)
        amenities: {
          list: amenities,
          has_food: pg.food_available === 1,
          food_type: pg.food_type,
          has_ac: pg.ac_available === 1,
          has_wifi: pg.wifi_available === 1,
          has_parking: pg.parking_available === 1,
          has_cctv: pg.cctv === 1,
          has_gym: pg.gym === 1,
          has_housekeeping: pg.housekeeping === 1,
          has_power_backup: pg.power_backup === 1
        },
        
        // Rules & Restrictions
        rules: {
          couple_allowed: pg.couple_allowed === 1,
          family_allowed: pg.family_allowed === 1,
          visitors_till: pg.visitors_allowed_till,
          min_stay: pg.min_stay_months,
          notice_period: pg.notice_period,
          guests_allowed: pg.visitors_allowed_till ? 'Yes' : 'No'
        },
        
        // Reviews
        reviews: {
          average: pg.average_rating || 0,
          total: pg.total_reviews || 0,
          latest: reviewsRows.map(r => ({
            id: r.id,
            user: {
              name: r.user_name,
              photo: r.user_photo
            },
            rating: r.rating,
            comment: r.comment,
            date: r.created_at
          }))
        },
        
        // Contact Info
        contact: {
          person: pg.contact_person,
          phone: pg.contact_phone,
          email: pg.contact_email
        },
        
        // Description
        description: pg.description,
        
        // Metadata
        last_updated: pg.updated_at || pg.created_at,
        is_verified: pg.status === 'active'
      }
    };

    console.log(`✅ QR scan successful. Found ${roomRows.length} available rooms.`);

    res.json(response);

  } catch (error) {
    console.error("❌ QR SCAN ERROR:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: error.message 
    });
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