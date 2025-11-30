import admin from "./firebaseAdmin.js";

export async function sendPushToUser(user, payload) {
  if (!user || !user.fcmToken) return;

  try {
    await admin.messaging().send({
      token: user.fcmToken,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {},
    });
  } catch (err) {
    console.error("FCM send error:", err.message);
  }
}
