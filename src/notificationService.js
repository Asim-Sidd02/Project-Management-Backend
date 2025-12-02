
import { getMessaging } from "../firebaseAdmin.js";
import User from "../models/User.js";

export async function sendPushToUserIds(userIds, payload) {
  const messaging = getMessaging();
  if (!messaging) {
    console.warn("⚠️ FCM not initialized, skipping push");
    return;
  }

  if (!Array.isArray(userIds) || userIds.length === 0) return;

  // 1) Load users and tokens
  const users = await User.find(
    { _id: { $in: userIds } },
    { fcmToken: 1, username: 1 }
  ).lean();

  const tokens = users
    .map((u) => u.fcmToken)
    .filter((t) => !!t);

  if (!tokens.length) {
    console.log("ℹ️ No FCM tokens for users:", userIds);
    return;
  }

  const { title, body, data = {} } = payload;

  const message = {
    notification: { title, body },
    data,
    tokens,
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    console.log(
      `📲 FCM sent: success=${response.successCount}, failure=${response.failureCount}`
    );

    if (response.failureCount > 0) {
      response.responses.forEach((r, idx) => {
        if (!r.success) {
          console.warn(
            `  └─ token ${tokens[idx]} error:`,
            r.error?.message || r.error
          );
        }
      });
    }
  } catch (err) {
    console.error("❌ FCM send error:", err.message);
  }
}
