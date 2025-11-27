// src/routes/userRoutes.js
import express from "express";
import { auth } from "../middleware/auth.js";
import User from "../models/User.js";

const router = express.Router();

// GET /api/users/me
router.get("/me", auth, async (req, res) => {
  res.json(req.user);
});

// PATCH /api/users/me
router.patch("/me", auth, async (req, res) => {
  try {
    const { username, avatarUrl } = req.body;

    if (username) req.user.username = username;
    if (avatarUrl) req.user.avatarUrl = avatarUrl;

    await req.user.save();
    res.json(req.user);
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
