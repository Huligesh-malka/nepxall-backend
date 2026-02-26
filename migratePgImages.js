require("dotenv").config();
const db = require("./db");

async function migrateImages() {
  try {
    console.log("🚀 Migration started...");

    const [pgs] = await db.query(
      "SELECT id, photos FROM pgs WHERE photos IS NOT NULL"
    );

    for (const pg of pgs) {

      let images = [];

      const raw = pg.photos.trim();

      // JSON format
      if (raw.startsWith("[")) {
        try {
          images = JSON.parse(raw);
        } catch {
          console.log(`❌ Invalid JSON for PG ${pg.id}`);
          continue;
        }
      }

      // Comma separated
      else if (raw.includes(",")) {
        images = raw.split(",");
      }

      // Single image
      else {
        images = [raw];
      }

      for (const img of images) {

        const cleanImg = img.trim();
        if (!cleanImg) continue;

        await db.query(
          `INSERT INTO pg_images (pg_id, image_url) VALUES (?, ?)`,
          [pg.id, cleanImg]
        );
      }

      console.log(`✅ Migrated PG ${pg.id}`);
    }

    console.log("🎉 MIGRATION COMPLETED");
    process.exit();

  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
}

migrateImages();