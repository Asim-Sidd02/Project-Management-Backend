import express from "express";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { auth } from "../middleware/auth.js";
import { requireProjectRole } from "../middleware/roles.js";
import Project from "../models/Project.js";
import Invitation from "../models/Invitation.js";
import User from "../models/User.js";

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Create project (current user becomes owner)
router.post("/", auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    const project = await Project.create({
      name,
      description,
      owner: req.user._id,
      members: [{ user: req.user._id, role: "owner" }]
    });

    res.status(201).json(project);
  } catch (err) {
    console.error("Create project error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Get projects where user is a member
router.get("/my", auth, async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [
        { owner: req.user._id },
        { "members.user": req.user._id }
      ]
    }).sort({ createdAt: -1 });

    res.json(projects);
  } catch (err) {
    console.error("Get my projects error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Invite to project by email (owner/leader)
router.post("/:projectId/invite", auth, requireProjectRole(["owner", "leader"]), async (req, res) => {
  try {
    const { email, role = "member" } = req.body;
    const { project } = req;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    if (!["member", "leader"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    // Check if user exists in database
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: "User does not exist" });
    }

    // Check if already member
    const alreadyMember = project.members.some(
      (m) => m.user.toString() === user._id.toString()
    );
    if (alreadyMember) {
      return res.status(400).json({ message: "User already in project" });
    }

    // Add user to project
    project.members.push({ user: user._id, role });
    await project.save();

    return res.status(200).json({
      message: "User successfully added to project",
      userId: user._id,
      role
    });
  } catch (err) {
    console.error("Invite error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});


export default router;
