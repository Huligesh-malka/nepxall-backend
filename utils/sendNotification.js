const admin = require("firebase-admin");

//////////////////////////////////////////////////////
// 🔥 SERVICE ACCOUNT
//////////////////////////////////////////////////////
const serviceAccount = require("../serviceAccountKey.json");

//////////////////////////////////////////////////////
// 🔥 INITIALIZE FIREBASE ADMIN
//////////////////////////////////////////////////////
if (!admin.apps.length) {

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

}

//////////////////////////////////////////////////////
// 🔥 SEND PUSH NOTIFICATION
//////////////////////////////////////////////////////
const sendNotification = async (
  token,
  title,
  body
) => {

  try {

    if (!token) {

      console.log("❌ No FCM token");

      return;

    }

    await admin.messaging().send({

      token,

      notification: {
        title,
        body
      }

    });

    console.log("✅ Notification sent");

  } catch (err) {

    console.error(
      "❌ Notification error:",
      err.message
    );

  }

};

module.exports = sendNotification;