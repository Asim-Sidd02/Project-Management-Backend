// src/services/notificationService.js
import admin from "firebase-admin";
import User from "./models/User.js"; // adjust path if needed: "../models/User.js"

// ---- FIREBASE ADMIN INIT ----
if (!admin.apps.length) {
  try {
    // Option 1: SERVICE_ACCOUNT_JSON in env (stringified JSON)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      );

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("✅ Firebase Admin initialized from SERVICE_ACCOUNT_JSON");
    } else {
      // Option 2: GOOGLE_APPLICATION_CREDENTIALS points to JSON file
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      console.log("✅ Firebase Admin initialized from default credentials");
    }
  } catch (e) {
    console.error("❌ Firebase Admin init error:", e.message);
  }
}

/**
 * Send push to all FCM tokens for a list of userIds
 * payload: { title, body, data? }
 */
export async function sendPushToUserIds(userIds, payload) {
  try {
    if (!userIds || userIds.length === 0) {
      console.log("📭 sendPushToUserIds: no userIds, skipping");
      return;
    }

    // Fetch FCM tokens from User documents
    const users = await User.find(
      { _id: { $in: userIds } },
      { fcmTokens: 1 }
    ).lean();

    const tokens = [];
    for (const u of users) {
      if (Array.isArray(u.fcmTokens)) {
        for (const t of u.fcmTokens) {
          if (t && typeof t === "string") tokens.push(t);
        }
      }
    }

    console.log(
      `📬 sendPushToUserIds: users=${userIds.length}, tokens=${tokens.length}`
    );

    if (tokens.length === 0) {
      console.log("📭 No FCM tokens, nothing to send");
      return;
    }

    const message = {
      notification: {
        title: payload.title || "Notification",
        body: payload.body || "",
      },
      data: payload.data || {},
      tokens,
    };

    const resp = await admin.messaging().sendEachForMulticast(message);
    console.log(
      `📲 FCM sent: success=${resp.successCount}, failure=${resp.failureCount}`
    );

    if (resp.failureCount > 0) {
      resp.responses.forEach((r, idx) => {
        if (!r.success) {
          console.warn(
            `⚠️ FCM failure for token[${idx}]:`,
            r.error?.message
          );
        }
      });
    }
  } catch (e) {
    console.error("❌ sendPushToUserIds error:", e.message);
  }
}
