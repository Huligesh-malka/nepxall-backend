const admin = require("firebase-admin");

//////////////////////////////////////////////////////
// 🔥 INITIALIZE FIREBASE ADMIN
//////////////////////////////////////////////////////
if (!admin.apps.length) {

  admin.initializeApp({

    credential: admin.credential.cert({

      projectId:
        process.env.FIREBASE_PROJECT_ID,

      clientEmail:
        process.env.FIREBASE_CLIENT_EMAIL,

      privateKey:
        process.env.FIREBASE_PRIVATE_KEY
          .replace(/\\n/g, '\n')

    })

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