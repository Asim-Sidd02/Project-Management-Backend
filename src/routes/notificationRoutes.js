// src/routes/notificationRoutes.js
import express from "express";
import { auth } from "../middleware/auth.js";
import User from "../models/User.js";
import { sendPushToUserIds } from "./../notificationService.js";

const router = express.Router();

/**
 * POST /api/notifications/token
 * body: { fcmToken }
 * Save/Update the device token for current user
 */
router.post("/token", auth, async (req, res) => {
  try {
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ message: "fcmToken is required" });
    }

    await User.updateOne(
      { _id: req.user._id },
      { $set: { fcmToken } }
    );

    console.log(`🔗 Saved FCM token for user ${req.user._id}`);
    res.json({ message: "Token saved" });
  } catch (err) {
    console.error("Save token error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/notifications/test
 * Quick manual test: send a push to the current user
 */
router.get("/test", auth, async (req, res) => {
  try {
    await sendPushToUserIds(
      [req.user._id],
      {
        title: "Test Notification",
        body: "This is a test from Sentinel backend 👋",
        data: { type: "test" },
      }
    );

    res.json({ message: "Test notification triggered" });
  } catch (err) {
    console.error("Test notification error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
