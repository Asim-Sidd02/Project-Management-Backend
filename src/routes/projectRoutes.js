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

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (
      existingUser &&
      project.members.some((m) => m.user.toString() === existingUser._id.toString())
    ) {
      return res
        .status(400)
        .json({ message: "User is already a member of this project" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await Invitation.create({
      project: project._id,
      email: email.toLowerCase(),
      role,
      token,
      invitedBy: req.user._id,
      expiresAt
    });

    const frontendUrl = process.env.FRONTEND_URL || "https://your-frontend-url.com";
    const acceptUrl = `${frontendUrl}/accept-invite?token=${token}`;

    await transporter.sendMail({
      from: `"Sentinel" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `You've been invited to project "${project.name}"`,
      html: `
        <p>You have been invited to join the project <b>${project.name}</b> in Sentinel.</p>
        <p>Role: <b>${role}</b></p>
        <p>Click the link below to accept the invitation:</p>
        <p><a href="${acceptUrl}">${acceptUrl}</a></p>
        <p>This link expires on ${expiresAt.toUTCString()}.</p>
      `
    });

    res.status(201).json({ message: "Invitation sent", invitationId: invitation._id });
  } catch (err) {
    console.error("Invite error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Accept invite (logged-in user)
router.post("/accept-invite", auth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "Token is required" });

    const invitation = await Invitation.findOne({ token });
    if (!invitation) {
      return res.status(400).json({ message: "Invalid invitation token" });
    }

    if (invitation.status !== "pending" || invitation.expiresAt < new Date()) {
      return res.status(400).json({ message: "Invitation has expired or already used" });
    }

    if (invitation.email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).json({
        message: "This invitation was sent to a different email address"
      });
    }

    const project = await Project.findById(invitation.project);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const alreadyMember = project.members.some(
      (m) => m.user.toString() === req.user._id.toString()
    );
    if (!alreadyMember) {
      project.members.push({
        user: req.user._id,
        role: invitation.role
      });
      await project.save();
    }

    invitation.status = "accepted";
    await invitation.save();

    res.json({
      message: "You have joined the project",
      projectId: project._id,
      role: invitation.role
    });
  } catch (err) {
    console.error("Accept invite error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
