import express from "express";
import { auth } from "../middleware/auth.js";
import User from "../models/User.js";

const router = express.Router();

// POST /api/notifications/token
router.post("/token", auth, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ message: "fcmToken is required" });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { fcmToken },
      { new: true }
    ).select("_id email username fcmToken");

    return res.json({ message: "Token updated", user });
  } catch (err) {
    console.error("FCM token save error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
