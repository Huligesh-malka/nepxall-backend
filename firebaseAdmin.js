const admin = require("firebase-admin");

let serviceAccount = null;

/* ======================================================
   LOAD SERVICE ACCOUNT
====================================================== */
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // 🔥 FIX PRIVATE KEY NEWLINES
    if (serviceAccount.private_key) {
      serviceAccount.private_key =
        serviceAccount.private_key.replace(/\\n/g, "\n");
    }

    console.log("✅ Firebase: Using service account from ENV");
  } catch (error) {
    console.error("❌ Firebase ENV JSON parse failed:", error.message);

    const preview = process.env.FIREBASE_SERVICE_ACCOUNT?.substring(0, 120);
    console.log("🔍 ENV Preview:", preview, "...");

    serviceAccount = null;
  }
}

/* ======================================================
   LOCAL FALLBACK (ONLY FOR DEVELOPMENT)
====================================================== */
if (!serviceAccount) {
  try {
    serviceAccount = require("./serviceAccountKey.json");
    console.log("✅ Firebase: Using local serviceAccountKey.json");
  } catch (err) {
    console.warn("⚠️ No Firebase service account found");
  }
}

/* ======================================================
   INITIALIZE FIREBASE
====================================================== */
if (!admin.apps.length && serviceAccount) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("✅ Firebase Admin initialized");
  } catch (error) {
    console.error("❌ Firebase initialization error:", error.message);
  }
} else if (!serviceAccount) {
  console.warn("⚠️ Firebase not initialized");
}

module.exports = admin;