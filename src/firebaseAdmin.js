// src/firebaseAdmin.js
import admin from "firebase-admin";

let app = null;

function initFirebaseAdmin() {
  if (app) return app;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT not set – FCM disabled");
    return null;
  }

  try {
    const serviceAccount = JSON.parse(raw);

    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("✅ Firebase Admin initialized for FCM");
    return app;
  } catch (err) {
    console.error("❌ Failed to init Firebase Admin:", err.message);
    return null;
  }
}

export function getMessaging() {
  const _app = initFirebaseAdmin();
  if (!_app) return null;
  return admin.messaging();
}
