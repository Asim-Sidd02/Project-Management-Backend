// src/routes/taskRoutes.js
import express from "express";
import { auth } from "../middleware/auth.js";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import { requireProjectRole } from "../middleware/roles.js";

const router = express.Router();

// Helper: ensure user is project member
const ensureMember = async (userId, projectId) => {
  const project = await Project.findById(projectId);
  if (!project) return { ok: false, reason: "Project not found" };

  const membership = project.members.find(
    (m) => m.user.toString() === userId.toString()
  );
  if (!membership) return { ok: false, reason: "Not a member of this project" };
  return { ok: true, project, membership };
};

// POST /api/tasks  (create task – only owner/leader)
router.post(
  "/",
  auth,
  requireProjectRole(["owner", "leader"]),
  async (req, res) => {
    try {
      const { title, description, projectId } = req.body;

      const task = await Task.create({
        project: projectId,
        title,
        description,
        createdBy: req.user._id,
      });

      res.status(201).json(task);
    } catch (err) {
      console.error("Create task error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// GET /api/tasks/by-project/:projectId
router.get("/by-project/:projectId", auth, async (req, res) => {
  try {
    const { projectId } = req.params;

    const check = await ensureMember(req.user._id, projectId);
    if (!check.ok) return res.status(403).json({ message: check.reason });

    const tasks = await Task.find({ project: projectId }).populate(
      "createdBy",
      "username"
    );
    res.json(tasks);
  } catch (err) {
    console.error("Get tasks error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/tasks/:taskId  (update task details – owner/leader)
router.patch(
  "/:taskId",
  auth,
  async (req, res) => {
    try {
      const { taskId } = req.params;
      const { title, description, status } = req.body;

      const task = await Task.findById(taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });

      // Check if user is leader/owner
      const project = await Project.findById(task.project);
      const membership = project.members.find(
        (m) => m.user.toString() === req.user._id.toString()
      );
      if (!membership) {
        return res.status(403).json({ message: "Not a member of this project" });
      }

      const isLeaderOrOwner = ["owner", "leader"].includes(membership.role);

      // Only leaders/owner can edit title/description
      if ((title || description) && !isLeaderOrOwner) {
        return res
          .status(403)
          .json({ message: "Only leader/owner can edit task details" });
      }

      if (title) task.title = title;
      if (description) task.description = description;

      // Everyone can update status, but must belong to project
      if (status) {
        if (!["not_started", "in_progress", "completed"].includes(status)) {
          return res.status(400).json({ message: "Invalid status" });
        }
        task.status = status;
      }

      await task.save();
      res.json(task);
    } catch (err) {
      console.error("Update task error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// DELETE /api/tasks/:taskId  (only owner/leader)
router.delete("/:taskId", auth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const project = await Project.findById(task.project);
    const membership = project.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    if (!membership) {
      return res.status(403).json({ message: "Not a member of this project" });
    }

    if (!["owner", "leader"].includes(membership.role)) {
      return res
        .status(403)
        .json({ message: "Only owner/leader can delete tasks" });
    }

    await task.deleteOne();
    res.json({ message: "Task deleted" });
  } catch (err) {
    console.error("Delete task error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/tasks/:taskId/notes  (any member can add note)
router.post("/:taskId/notes", auth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { text } = req.body;

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const check = await ensureMember(req.user._id, task.project);
    if (!check.ok) return res.status(403).json({ message: check.reason });

    task.notes.push({
      user: req.user._id,
      text,
    });

    await task.save();
    res.json(task);
  } catch (err) {
    console.error("Add note error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;