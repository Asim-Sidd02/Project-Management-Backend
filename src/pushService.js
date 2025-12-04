import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase Admin initialized");
  } else {
    console.warn(
      "⚠️ FIREBASE_SERVICE_ACCOUNT not set – push notifications disabled"
    );
  }
}

/**
 * Send push to FCM tokens
 */
export async function sendPushToTokens({ tokens, title, body, data = {} }) {
  if (!tokens || !tokens.length) return;

  const message = {
    notification: { title: title || "Notification", body: body || "" },
    data,
    tokens,
    android: { priority: "high" },
    apns: { headers: { "apns-priority": "10" } },
  };

  try {
    const resp = await admin.messaging().sendEachForMulticast(message);
    console.log(
      `📲 FCM sent: success=${resp.successCount}, failure=${resp.failureCount}`
    );
  } catch (e) {
    console.error("FCM push error:", e.message);
  }
}

/**
 * Send push to multiple users by userIds
 */
export async function sendPushToUserIds({ userIds, title, body, data = {} }) {
  if (!userIds || !userIds.length) return;

  const { default: User } = await import("./models/User.js");

  const users = await User.find(
    { _id: { $in: userIds }, fcmTokens: { $ne: null } },
    "fcmTokens"
  ).lean();

  const tokens = users.flatMap((u) => u.fcmTokens || []);
  if (!tokens.length) return;

  return sendPushToTokens({ tokens, title, body, data });
}
