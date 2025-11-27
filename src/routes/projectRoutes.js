// src/routes/projectRoutes.js
import express from "express";
import { auth } from "../middleware/auth.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import { requireProjectRole } from "../middleware/roles.js";

const router = express.Router();

// POST /api/projects  (create project, creator becomes owner)
router.post("/", auth, async (req, res) => {
  try {
    const { name, description } = req.body;

    const project = await Project.create({
      name,
      description,
      owner: req.user._id,
      members: [{ user: req.user._id, role: "owner" }],
    });

    res.status(201).json(project);
  } catch (err) {
    console.error("Create project error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/projects/my  (projects where user is a member)
router.get("/my", auth, async (req, res) => {
  try {
    const projects = await Project.find({
      "members.user": req.user._id,
    }).populate("owner", "username email");
    res.json(projects);
  } catch (err) {
    console.error("Get my projects error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/projects/:projectId
router.get("/:projectId", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId)
      .populate("owner", "username email avatarUrl")
      .populate("members.user", "username email avatarUrl");

    if (!project) return res.status(404).json({ message: "Project not found" });

    const isMember = project.members.some(
      (m) => m.user._id.toString() === req.user._id.toString()
    );
    if (!isMember)
      return res.status(403).json({ message: "Not a member of this project" });

    res.json(project);
  } catch (err) {
    console.error("Get project error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/projects/:projectId/members  (owner/leader invite member)
router.post(
  "/:projectId/members",
  auth,
  requireProjectRole(["owner", "leader"]),
  async (req, res) => {
    try {
      const { userId, role = "member" } = req.body;
      const { project } = req;

      if (!["leader", "member"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const existing = project.members.find(
        (m) => m.user.toString() === userId
      );
      if (existing) {
        return res.status(400).json({ message: "User already a member" });
      }

      project.members.push({ user: userId, role });
      await project.save();

      res.json(project);
    } catch (err) {
      console.error("Add member error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// PATCH /api/projects/:projectId/members/:memberId  (change role)
router.patch(
  "/:projectId/members/:memberId",
  auth,
  requireProjectRole(["owner"]),
  async (req, res) => {
    try {
      const { role } = req.body;
      const { project } = req;
      const { memberId } = req.params;

      if (!["leader", "member"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      const member = project.members.find(
        (m) => m.user.toString() === memberId
      );
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      if (member.role === "owner") {
        return res.status(400).json({ message: "Cannot change owner role" });
      }

      member.role = role;
      await project.save();
      res.json(project);
    } catch (err) {
      console.error("Update member role error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// DELETE /api/projects/:projectId/members/:memberId  (remove member)
router.delete(
  "/:projectId/members/:memberId",
  auth,
  requireProjectRole(["owner", "leader"]),
  async (req, res) => {
    try {
      const { project } = req;
      const { memberId } = req.params;

      const member = project.members.find(
        (m) => m.user.toString() === memberId
      );
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      if (member.role === "owner") {
        return res.status(400).json({ message: "Cannot remove owner" });
      }

      project.members = project.members.filter(
        (m) => m.user.toString() !== memberId
      );
      await project.save();
      res.json(project);
    } catch (err) {
      console.error("Remove member error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
