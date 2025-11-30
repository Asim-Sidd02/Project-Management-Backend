import express from "express";
import { auth } from "../middleware/auth.js";
import { requireProjectRole } from "../middleware/roles.js"; // (you might not actually use this in this file)
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import { sendPushToUserIds } from "../pushService.js";   // 👈 NEW

const router = express.Router();

// create task (owner/leader)
router.post("/", auth, async (req, res) => {
  try {
    const { projectId, title, description } = req.body;
    if (!projectId || !title) {
      return res.status(400).json({ message: "projectId and title are required" });
    }

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const userId = req.user._id.toString();
    let role = null;
    if (project.owner.toString() === userId) {
      role = "owner";
    } else {
      const member = project.members.find((m) => m.user.toString() === userId);
      role = member?.role || null;
    }

    if (!role || !["owner", "leader"].includes(role)) {
      return res.status(403).json({ message: "Only owner/leader can create tasks" });
    }

    const task = await Task.create({
      project: projectId,
      title,
      description,
      createdBy: req.user._id
    });

    // 🔔 Push notification to all project members (except creator)
    try {
      const memberIds = [
        project.owner,
        ...project.members.map((m) => m.user)
      ].map((id) => id.toString());

      const creatorId = req.user._id.toString();
      const unique = Array.from(new Set(memberIds));
      const recipientIds = unique.filter((id) => id !== creatorId);

      if (recipientIds.length) {
        const creatorName = req.user.username || "New task";

        await sendPushToUserIds({
          userIds: recipientIds,
          title: `New task in ${project.name}`,
          body: `${creatorName} created: ${task.title}`,
          data: {
            type: "task",
            projectId: project._id.toString(),
            taskId: task._id.toString(),
          },
        });
      }
    } catch (e) {
      console.error("Task create push error:", e.message);
    }

    res.status(201).json(task);
  } catch (err) {
    console.error("Create task error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// get tasks by project
router.get("/by-project/:projectId", auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const tasks = await Task.find({ project: projectId }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    console.error("Get tasks error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// update task status (any member)
router.patch("/:taskId", auth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;
    if (!["not_started", "in_progress", "completed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const task = await Task.findById(taskId).populate("project");
    if (!task) return res.status(404).json({ message: "Task not found" });

    const project = task.project;
    const userId = req.user._id.toString();
    const isMember =
      project.owner.toString() === userId ||
      project.members.some((m) => m.user.toString() === userId);
    if (!isMember) {
      return res.status(403).json({ message: "You are not part of this project" });
    }

    task.status = status;
    await task.save();

    res.json(task);
  } catch (err) {
    console.error("Update task error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// add note to task (any member)
router.post("/:taskId/notes", auth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "Text is required" });

    const task = await Task.findById(taskId).populate("project");
    if (!task) return res.status(404).json({ message: "Task not found" });

    const project = task.project;
    const userId = req.user._id.toString();
    const isMember =
      project.owner.toString() === userId ||
      project.members.some((m) => m.user.toString() === userId);
    if (!isMember) {
      return res.status(403).json({ message: "You are not part of this project" });
    }

    task.notes.push({
      user: req.user._id,
      text
    });
    await task.save();

    res.json(task);
  } catch (err) {
    console.error("Add note error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
