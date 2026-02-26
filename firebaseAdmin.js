// backendss/firebaseAdmin.js
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Check if already initialized
if (!admin.apps.length) {
  try {
    console.log('🔧 Initializing Firebase Admin...');
    console.log('📡 Environment:', process.env.NODE_ENV || 'development');

    // For production (Render)
    if (process.env.NODE_ENV === 'production') {
      console.log('🔥 Using environment variables for Firebase config');
      
      // Check if required env vars exist
      const requiredVars = [
        'FIREBASE_PROJECT_ID',
        'FIREBASE_PRIVATE_KEY_ID',
        'FIREBASE_PRIVATE_KEY',
        'FIREBASE_CLIENT_EMAIL',
        'FIREBASE_CLIENT_ID',
        'FIREBASE_CERT_URL'
      ];
      
      const missingVars = requiredVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        console.error('❌ Missing Firebase environment variables:', missingVars.join(', '));
        throw new Error('Firebase configuration missing');
      }

      // Handle private key with newlines - CRITICAL FIX
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      
      // Log first few chars for debugging (safe)
      console.log('🔑 Private key preview:', privateKey.substring(0, 50) + '...');
      
      // Replace escaped newlines with actual newlines
      // This is the most common issue
      privateKey = privateKey.replace(/\\n/g, '\n');
      
      // Also handle if it's stored with literal \n
      if (privateKey.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
      }
      
      // Ensure the key has the proper header and footer
      if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
      }

      const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: privateKey,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CERT_URL
      };

      console.log('✅ Service account created');
      console.log('📧 Client email:', serviceAccount.client_email);
      console.log('🆔 Project ID:', serviceAccount.project_id);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } 
    // For development (local)
    else {
      console.log('💻 Using local serviceAccountKey.json');
      
      // Check if service account file exists
      const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
      
      if (!fs.existsSync(serviceAccountPath)) {
        console.error('❌ serviceAccountKey.json not found at:', serviceAccountPath);
        throw new Error('Service account file missing');
      }

      const serviceAccount = require(serviceAccountPath);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    
    console.log('✅ Firebase Admin initialized successfully');
    
    // Test the connection with a simple operation
    setTimeout(async () => {
      try {
        // Try to list users (just one) to verify auth works
        const listUsersResult = await admin.auth().listUsers(1);
        console.log('✅ Firebase Auth connection verified - can list users');
      } catch (err) {
        console.error('⚠️ Firebase Auth test failed:', err.message);
        console.error('This might affect token verification');
      }
    }, 1000);
      
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error);
    console.error('Stack:', error.stack);
  }
}

module.exports = admin;