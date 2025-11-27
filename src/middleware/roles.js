// src/middleware/roles.js
import Project from "../models/Project.js";

export const requireProjectRole =
  (roles = ["owner", "leader"]) =>
  async (req, res, next) => {
    const projectId = req.params.projectId || req.body.projectId;

    if (!projectId) {
      return res.status(400).json({ message: "projectId is required" });
    }

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const membership = project.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );

    if (!membership) {
      return res.status(403).json({ message: "Not a member of this project" });
    }

    if (!roles.includes(membership.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    req.project = project;
    req.membership = membership;
    next();
  };
