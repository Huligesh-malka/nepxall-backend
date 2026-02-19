const admin = require("firebase-admin");

// 👇 PUT THE REAL PATH
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
