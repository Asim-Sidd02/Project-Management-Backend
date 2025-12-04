// src/services/notificationService.js
import admin from "firebase-admin";
import User from "./models/User.js";

if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log("✅ Firebase Admin initialized from SERVICE_ACCOUNT_JSON");
    } else {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
      console.log("✅ Firebase Admin initialized from default credentials");
    }
  } catch (e) {
    console.error("❌ Firebase Admin init error:", e.message);
  }
}

/**
 * Send FCM push notifications to multiple userIds, excluding the sender
 * @param {Array<string>} userIds - recipient user IDs (Mongo _id strings)
 * @param {string} senderId - MongoDB _id of sender
 * @param {Object} payload - { title, body, data }
 */
export async function sendPushToUserIds(userIds, senderId, payload) {
  try {
    if (!userIds || userIds.length === 0) return;

    // ✅ REMOVE SENDER FROM USER LIST
    const recipientIds = userIds.filter(
      (id) => String(id) !== String(senderId)
    );
    if (!recipientIds.length) return;

    // fetch only recipient users (no sender)
    const users = await User.find(
      { _id: { $in: recipientIds }, fcmTokens: { $ne: null } },
      "fcmTokens _id"
    ).lean();

    const tokens = users.flatMap((u) => u.fcmTokens || []);
    if (!tokens.length) return;

    const message = {
      notification: {
        title: payload.title || "Notification",
        body: payload.body || "",
      },
      data: payload.data || {},
      tokens,
      android: { priority: "high" },
      apns: { headers: { "apns-priority": "10" } },
    };

    const resp = await admin.messaging().sendEachForMulticast(message);
    console.log(
      `📲 FCM sent: success=${resp.successCount}, failure=${resp.failureCount}`
    );

    if (resp.failureCount > 0) {
      resp.responses.forEach((r, idx) => {
        if (!r.success) {
          console.warn(`⚠️ FCM failure for token[${idx}]:`, r.error?.message);
        }
      });
    }
  } catch (e) {
    console.error("❌ sendPushToUserIds error:", e.message);
  }
}
