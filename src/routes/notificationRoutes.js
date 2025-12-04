import express from "express";
import { auth } from "../middleware/auth.js";
import User from "../models/User.js";

const router = express.Router();

/**
 * POST /api/notifications/onesignal-token
 * Save OneSignal player ID for the logged-in user
 */
router.post("/onesignal-token", auth, async (req, res) => {
  try {
    const { playerId } = req.body;
    if (!playerId) return res.status(400).json({ message: "playerId is required" });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.oneSignalIds.includes(playerId)) {
      user.oneSignalIds.push(playerId);
      await user.save();
    }

    return res.json({ message: "OneSignal playerId saved" });
  } catch (err) {
    console.error("Save OneSignal token error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
