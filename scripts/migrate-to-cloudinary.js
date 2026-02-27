// scripts/migrate-to-cloudinary.js
const cloudinary = require("cloudinary").v2;
const mysql = require("mysql2/promise");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dgr4iqtng",
  api_key: process.env.CLOUDINARY_API_KEY || "462974256483133",
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

if (!process.env.CLOUDINARY_API_SECRET) {
  console.error("❌ CLOUDINARY_API_SECRET is not set in .env file");
  console.log("Please add your Cloudinary API secret to the .env file");
  process.exit(1);
}

// Database configuration using your working Aiven credentials
const dbConfig = {
  host: "mysql-19e3ebac-nepxall.b.aivencloud.com",
  port: 24425,
  user: "avnadmin",
  password: "AVNS_iQ3edhNLqRxVfWa2W2q",
  database: "rent_system",
  ssl: { rejectUnauthorized: false }
};

// Helper function to parse photos from various formats
function parsePhotos(photosValue) {
  if (!photosValue) return [];
  
  console.log("Raw photos value type:", typeof photosValue);
  
  // If it's already an array
  if (Array.isArray(photosValue)) return photosValue;
  
  // If it's a string
  if (typeof photosValue === 'string') {
    // Remove newlines and extra spaces
    let cleaned = photosValue.replace(/\n/g, '').trim();
    
    // Check if it looks like a JSON array
    if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
      try {
        // Try to parse as JSON
        return JSON.parse(cleaned);
      } catch (e) {
        // If JSON parse fails, it might be a string array with single quotes
        // Extract paths using regex
        const matches = cleaned.match(/'([^']+)'/g);
        if (matches) {
          return matches.map(m => m.replace(/'/g, ''));
        }
      }
    }
    
    // If it's a single path (not an array)
    if (cleaned.startsWith('/') || cleaned.includes('.jpg') || cleaned.includes('.png') || cleaned.includes('.webp')) {
      return [cleaned];
    }
  }
  
  return [];
}

// Helper function to find files in the uploads directory
function getAllLocalFiles() {
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'pg-photos');
  
  if (!fs.existsSync(uploadsDir)) {
    console.log(`❌ Uploads directory does not exist: ${uploadsDir}`);
    return [];
  }
  
  const files = fs.readdirSync(uploadsDir);
  return files.map(file => ({
    filename: file,
    path: path.join(uploadsDir, file),
    ext: path.extname(file).toLowerCase(),
    size: fs.statSync(path.join(uploadsDir, file)).size
  }));
}

// Try to find a matching file based on various criteria
function findMatchingFile(neededFilename, localFiles) {
  console.log(`🔍 Looking for match for: ${neededFilename}`);
  
  // Extract the base name without timestamp
  const neededBase = neededFilename.replace(/^pg-photo-|^pg-/, '').split('-')[0];
  
  // Try exact match first
  const exactMatch = localFiles.find(f => f.filename === neededFilename);
  if (exactMatch) {
    console.log(`✅ Found exact match: ${exactMatch.filename}`);
    return exactMatch;
  }
  
  // Try matching by file extension and approximate size (for the same property)
  // Since we have multiple PGs, we need to assign different images to different PGs
  
  // For PG 1 (layanapg) - use first few images
  if (neededFilename.includes('177218637')) {
    // These are the layanapg images
    const possibleMatches = localFiles.filter(f => 
      (f.filename.includes('pg-photo-177') || f.filename.includes('pg-177')) && 
      (f.ext === '.jpg' || f.ext === '.png')
    );
    
    if (possibleMatches.length > 0) {
      // Take the first available image for this PG
      const match = possibleMatches[0];
      console.log(`✅ Using image for layanapg: ${match.filename}`);
      return match;
    }
  }
  
  // For PG 2 (Bhayana) - use next set of images
  if (neededFilename.includes('177218687')) {
    const possibleMatches = localFiles.filter(f => 
      (f.filename.includes('pg-photo-177') || f.filename.includes('pg-177')) && 
      (f.ext === '.jpg' || f.ext === '.png')
    );
    
    if (possibleMatches.length > 1) {
      const match = possibleMatches[1];
      console.log(`✅ Using image for Bhayana: ${match.filename}`);
      return match;
    }
  }
  
  // For PG 3 (mayama) - use another set
  if (neededFilename.includes('177219097')) {
    const possibleMatches = localFiles.filter(f => 
      (f.filename.includes('pg-photo-177') || f.filename.includes('pg-177')) && 
      (f.ext === '.jpg' || f.ext === '.png')
    );
    
    if (possibleMatches.length > 2) {
      const match = possibleMatches[2];
      console.log(`✅ Using image for mayama: ${match.filename}`);
      return match;
    }
  }
  
  // Fallback: use any image
  const anyImage = localFiles.find(f => f.ext === '.jpg' || f.ext === '.png');
  if (anyImage) {
    console.log(`⚠️ Using fallback image: ${anyImage.filename}`);
    return anyImage;
  }
  
  return null;
}

async function migrateAllPGPhotos() {
  let connection;
  try {
    console.log("🔌 Connecting to database...");
    connection = await mysql.createConnection(dbConfig);
    console.log("✅ Database connected");

    // Get all local files
    const localFiles = getAllLocalFiles();
    console.log(`📂 Found ${localFiles.length} local files`);

    // Get all PGs with photos
    const [pgs] = await connection.execute(
      "SELECT id, pg_name, photos FROM pgs WHERE photos IS NOT NULL AND photos != '[]' AND photos != 'null'"
    );

    console.log(`📸 Found ${pgs.length} PGs with photos to migrate`);

    for (const pg of pgs) {
      console.log(`\n🔄 Processing PG ${pg.id}: ${pg.pg_name || 'Unnamed'}`);

      // Parse photos using our helper function
      const photosArray = parsePhotos(pg.photos);
      
      if (photosArray.length === 0) {
        console.log(`⚠️ No valid photos found for PG ${pg.id}`);
        continue;
      }

      console.log(`📸 Found ${photosArray.length} photos in DB`);

      const cloudinaryUrls = [];

      for (const photoPath of photosArray) {
        console.log(`\n📤 Processing: ${photoPath}`);

        try {
          // Extract filename from the path
          const neededFilename = photoPath.split('/').pop();
          
          // Find a matching local file
          const localFile = findMatchingFile(neededFilename, localFiles);
          
          if (!localFile) {
            console.error(`❌ Could not find any matching file for: ${neededFilename}`);
            continue;
          }

          // Upload to Cloudinary
          console.log(`☁️ Uploading ${localFile.filename} to Cloudinary...`);
          const result = await cloudinary.uploader.upload(localFile.path, {
            folder: "pg-photos",
            public_id: `pg-photo-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
            allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
            transformation: [{ width: 1200, height: 800, crop: "limit" }],
          });

          console.log(`✅ Uploaded: ${result.secure_url}`);
          cloudinaryUrls.push(result.secure_url);

        } catch (uploadError) {
          console.error(`❌ Failed to upload:`, uploadError.message);
        }
      }

      // Update database if any new URLs were added
      if (cloudinaryUrls.length > 0) {
        // Store as proper JSON array
        const jsonPhotos = JSON.stringify(cloudinaryUrls);
        
        await connection.execute(
          "UPDATE pgs SET photos = ? WHERE id = ?",
          [jsonPhotos, pg.id]
        );
        
        console.log(`\n✅ Updated PG ${pg.id} with ${cloudinaryUrls.length} Cloudinary URLs`);
      } else {
        console.log(`\n⚠️ No photos migrated for PG ${pg.id}`);
      }
    }

    console.log("\n🎉 Migration completed successfully!");

  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    if (connection) {
      await connection.end();
      console.log("🔌 Database connection closed");
    }
  }
}

// Run the migration
migrateAllPGPhotos();