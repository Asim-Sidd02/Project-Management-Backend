// src/oneSignalService.js
import axios from "axios";

const ONE_SIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONE_SIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

if (!ONE_SIGNAL_APP_ID || !ONE_SIGNAL_API_KEY) {
  console.warn("⚠️ OneSignal env vars missing (ONESIGNAL_APP_ID / ONESIGNAL_API_KEY)");
}

/**
 * Send push to specific OneSignal player IDs
 */
export async function sendPushToPlayers(
  { playerIds = [], heading, content, data = {} } = {} // <-- default empty object
) {
  if (!ONE_SIGNAL_APP_ID || !ONE_SIGNAL_API_KEY) return;
  if (!playerIds.length) return;

  try {
    const body = {
      app_id: ONE_SIGNAL_APP_ID,
      include_player_ids: playerIds,
      headings: { en: heading },
      contents: { en: content },
      data,
    };

    await axios.post("https://onesignal.com/api/v1/notifications", body, {
      headers: {
        Authorization: `Basic ${ONE_SIGNAL_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("OneSignal push error:", err.response?.data || err.message);
  }
}


/**
 * Send to a specific user but exclude the sender
 */
export async function sendPushToUser(user, senderPlayerId, { heading, content, data = {} }) {
  if (!user || !user.oneSignalIds || !user.oneSignalIds.length) return;

  // Exclude sender's own Player ID
  const receiverPlayerIds = user.oneSignalIds.filter(id => id !== senderPlayerId);
  if (!receiverPlayerIds.length) return;

  return sendPushToPlayers({
    playerIds: receiverPlayerIds,
    heading,
    content,
    data,
  });
}
