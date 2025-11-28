import express from "express";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { auth } from "../middleware/auth.js";
import { requireProjectRole } from "../middleware/roles.js";
import Project from "../models/Project.js";
import Invitation from "../models/Invitation.js";
import User from "../models/User.js";
import ChatRoom from "../models/ChatRoom.js"; 

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Create project (current user becomes owner) + create project chat room
router.post("/", auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    // 1) Create project
    const project = await Project.create({
      name,
      description,
      owner: req.user._id,
      members: [{ user: req.user._id, role: "owner" }]
    });

    // 2) Create a chat room for this project
    const room = await ChatRoom.create({
      name,
      project: project._id,
      isProjectRoom: true,
      members: [req.user._id],
      createdBy: req.user._id
    });

    // 3) Optionally save reference in project if your schema has `chatRoom` field
    if (project.chatRoom === undefined) {
      // no field in schema; ignore
    } else {
      project.chatRoom = room._id;
      await project.save();
    }

    // keep response shape similar but now include chat room
    res.status(201).json({
      project,
      chatRoom: room
    });
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

// Invite user (in-app only) and add to project chat as well
router.post(
  "/:projectId/invite",
  auth,
  requireProjectRole(["owner", "leader"]),
  async (req, res) => {
    try {
      const { email, role = "member" } = req.body;
      const { project } = req;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      if (!["member", "leader"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      // 1) Check user exists
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(404).json({ message: "User does not exist" });
      }

      // 2) Check if already a member
      const alreadyMember = project.members.some(
        (m) => m.user.toString() === user._id.toString()
      );
      if (alreadyMember) {
        return res.status(400).json({ message: "User already in project" });
      }

      // 3) Add as member
      project.members.push({ user: user._id, role });
      await project.save();

      // 4) Also add them to the project chat room
      await ChatRoom.updateOne(
        { project: project._id },               // find project chat
        { $addToSet: { members: user._id } }    // avoid duplicates
      );

      res.status(200).json({
        message: "User successfully added to project",
        userId: user._id,
        role,
      });
    } catch (err) {
      console.error("Invite error:", err.message);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// GET /api/projects/:projectId/details
// Returns project with populated members + current user role
router.get("/:projectId/details", auth, async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId)
      .populate("members.user", "username email avatarUrl")
      .lean();

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const userId = req.user._id.toString();
    let role = null;

    if (project.owner.toString() === userId) {
      role = "owner";
    } else {
      const member = project.members.find(
        (m) => m.user && m.user._id.toString() === userId
      );
      role = member?.role || null;
    }

    if (!role) {
      return res
        .status(403)
        .json({ message: "You are not a member of this project" });
    }

    res.json({
      project,
      currentRole: role,
    });
  } catch (err) {
    console.error("Get project details error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/projects/:projectId/members/:userId
// Owner/leader can remove members (cannot remove owner)
router.delete(
  "/:projectId/members/:userId",
  auth,
  requireProjectRole(["owner", "leader"]),
  async (req, res) => {
    try {
      const { project } = req;
      const { userId } = req.params;

      // Don't allow removing owner
      if (project.owner.toString() === userId) {
        return res
          .status(400)
          .json({ message: "Cannot remove project owner" });
      }

      const member = project.members.find(
        (m) => m.user.toString() === userId
      );
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      // If remover is only leader, don't let them remove other leaders/owner
      if (
        req.projectRole === "leader" &&
        member.role !== "member"
      ) {
        return res
          .status(403)
          .json({ message: "Leaders can only remove members" });
      }

      // 1) Remove from project
      project.members = project.members.filter(
        (m) => m.user.toString() !== userId
      );
      await project.save();

      // 2) Also remove from project chat room
      await ChatRoom.updateOne(
        { project: project._id },
        { $pull: { members: userId } }
      );

      res.json({ message: "Member removed" });
    } catch (err) {
      console.error("Remove member error:", err.message);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
