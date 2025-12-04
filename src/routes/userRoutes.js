// src/routes/userRoutes.js
import express from "express";
import { auth } from "../middleware/auth.js";
import User from "../models/User.js";

const router = express.Router();

// GET /api/users/me  -> current user profile
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    console.error("Get profile error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/users/me  -> update username and/or avatar (base64)
router.put("/me", auth, async (req, res) => {
  try {
    const { username, avatarBase64 } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (username && username !== user.username) {
      const existing = await User.findOne({ username });
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }
      user.username = username;
    }

    // Correct check for base64 string
    if (typeof avatarBase64 === "string" && avatarBase64.trim().length > 0) {
      console.log("🔥 Updating avatar, size:", avatarBase64.length);
      user.avatarUrl = avatarBase64;
    }

    await user.save();

    const safeUser = user.toObject();
    delete safeUser.password;

    res.json({ message: "Profile updated", user: safeUser });
  } catch (err) {
    console.error("Update profile error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/users/search?query=username
router.get("/search", auth, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.json([]);

    const users = await User.find({
      username: { $regex: query, $options: "i" },
    })
      .select("_id username email avatarUrl")
      .limit(20);

    res.json(users);
  } catch (err) {
    console.error("User search error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Store FCM token (if you still use Firebase Messaging)
router.put("/push-token", auth, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ message: "fcmToken is required" });
    }

    await User.findByIdAndUpdate(
      req.user._id,
      { fcmToken },
      { new: true }
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("push-token error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * OPTIONAL: clear FCM token on logout
 * POST /api/users/clear-push-token
 */
router.post("/clear-push-token", auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { fcmToken: null });
    return res.json({ ok: true });
  } catch (e) {
    console.error("clear-push-token error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Bind OneSignal playerId to the current user.
 * Ensures a given playerId belongs to ONLY this user.
 *
 * POST /api/users/onesignal
 * body: { playerId: string }
 */
router.post("/onesignal", auth, async (req, res) => {
  try {
    const { playerId } = req.body;

    if (!playerId) {
      return res.status(400).json({ message: "playerId is required" });
    }

    // 1) Remove this playerId from ALL other users
    await User.updateMany(
      { oneSignalIds: playerId },
      { $pull: { oneSignalIds: playerId } }
    );

    // 2) Attach it to the current user
    await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { oneSignalIds: playerId } },
      { new: true }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("onesignal bind error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/users/change-password
router.patch("/change-password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Both passwords are required" });
    }
    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    user.password = newPassword; // will get hashed in pre-save hook
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
