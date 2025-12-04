import axios from "axios";

const ONE_SIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONE_SIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

if (!ONE_SIGNAL_APP_ID || !ONE_SIGNAL_API_KEY) {
  console.warn(
    "⚠️ OneSignal env vars missing (ONESIGNAL_APP_ID / ONE_SIGNAL_API_KEY)"
  );
}

/**
 * Sends a push notification to specific OneSignal player IDs
 */
export async function sendPushToPlayers(
  { playerIds = [], heading = "", content = "", data = {} } = {}
) {
  if (!ONE_SIGNAL_APP_ID || !ONE_SIGNAL_API_KEY) return;
  if (!playerIds.length) return;

  try {
    const body = {
      app_id: ONE_SIGNAL_APP_ID,
      include_player_ids: playerIds,
      headings: { en: heading || "Notification" },
      contents: { en: content || "" },
      data,
      priority: 10,
    };

    const resp = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      body,
      {
        headers: {
          Authorization: `Basic ${ONE_SIGNAL_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ OneSignal response:", resp.data);
  } catch (err) {
    console.error("OneSignal push error:", err.response?.data || err.message);
  }
}

/**
 * Send notification to user, excluding sender if needed
 */
export async function sendPushToUser(
  user,
  { heading, content, data = {}, excludePlayerId }
) {
  if (!user || !user.oneSignalIds || !user.oneSignalIds.length) return;

  const playerIds = user.oneSignalIds.filter((id) => id !== excludePlayerId);
  if (!playerIds.length) return;

  return sendPushToPlayers({ playerIds, heading, content, data });
}
