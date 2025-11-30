import Project from "../models/Project.js";

// Load project from :projectId and check user role
export const requireProjectRole = (allowedRoles = []) => {
  return async (req, res, next) => {
    try {
      const projectId = req.params.projectId || req.params.id;
      if (!projectId) {
        return res.status(400).json({ message: "Project id is required" });
      }

      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const userId = req.user._id.toString();
      let role = null;

      if (project.owner.toString() === userId) {
        role = "owner";
      } else {
        const member = project.members.find(
          (m) => m.user.toString() === userId
        );
        role = member?.role || null;
      }

      if (!role || (allowedRoles.length && !allowedRoles.includes(role))) {
        return res.status(403).json({ message: "Forbidden" });
      }

      req.project = project;
      req.projectRole = role;
      next();
    } catch (err) {
      console.error("requireProjectRole error:", err.message);
      res.status(500).json({ message: "Server error" });
    }
  };
};
