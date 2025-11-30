// src/pushService.js
import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccountJson) {
    console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT not set – push notifications disabled");
  } else {
    const serviceAccount = JSON.parse(serviceAccountJson);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
}

export async function sendPushToTokens({ tokens, title, body, data = {} }) {
  if (!tokens || !tokens.length) return;
  if (!admin.apps.length) return;

  const message = {
    notification: {
      title,
      body,
    },
    data,
    tokens,
  };

  try {
    const resp = await admin.messaging().sendEachForMulticast(message);
    console.log("Push result:", resp.successCount, "sent");
  } catch (e) {
    console.error("Push error:", e.message);
  }
}

export async function sendPushToUserIds({ userIds, title, body, data = {} }) {
  if (!admin.apps.length) return;
  if (!userIds || !userIds.length) return;

  const { default: User } = await import("./models/User.js");

  const users = await User.find(
    { _id: { $in: userIds }, fcmToken: { $ne: null } },
    "fcmToken"
  ).lean();

  const tokens = users
    .map((u) => u.fcmToken)
    .filter(Boolean);

  if (!tokens.length) return;

  return sendPushToTokens({ tokens, title, body, data });
}
