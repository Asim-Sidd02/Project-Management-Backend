import express from "express";
import ChatRoom from "../models/ChatRoom.js";
import Message from "../models/Message.js";
import requireAuth from "../middleware/authMiddleware.js";
import Project from "../models/Project.js";

const router = express.Router();

/**
 * GET /api/chat/my-rooms
 * All chat rooms where current user is a member
 */
router.get("/my-rooms", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const rooms = await ChatRoom.find({ members: userId })
      .populate("project", "name")
      .sort({ updatedAt: -1 });

    return res.json(rooms);
  } catch (err) {
    console.error("my-rooms error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/chat/project/:projectId/room
 * Get (or ensure) the chat room for a project that the user is part of
 */
router.get("/project/:projectId/room", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // ensure user is a member of the project
    const isMember =
      project.owner.toString() === userId ||
      project.members.some((m) => m.user.toString() === userId);
    if (!isMember) {
      return res
        .status(403)
        .json({ message: "You are not a member of this project" });
    }

    let room = await ChatRoom.findOne({ project: project._id });
    if (!room) {
      // fallback – should normally already exist
      room = await ChatRoom.create({
        name: project.name,
        project: project._id,
        isProjectRoom: true,
        members: [project.owner],
        createdBy: project.owner,
      });
    }

    return res.json(room);
  } catch (err) {
    console.error("project room error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/chat/rooms
 * Create a custom group chat (not tied to a project)
 * body: { name, memberIds?: [userId] }
 */
router.post("/rooms", requireAuth, async (req, res) => {
  try {
    const { name, memberIds = [] } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({ message: "Room name is required" });
    }

    // ensure creator is in members
    const uniqueMembers = new Set(memberIds.map(String));
    uniqueMembers.add(String(userId));

    const room = await ChatRoom.create({
      name,
      isProjectRoom: false,
      members: Array.from(uniqueMembers),
      createdBy: userId,
    });

    return res.status(201).json(room);
  } catch (err) {
    console.error("create room error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/chat/rooms/:roomId/messages?limit=30
 * Fetch last N messages in room
 */
router.get("/rooms/:roomId/messages", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const limit = parseInt(req.query.limit || "30", 10);

    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Chat room not found" });
    }

    // check membership
    if (!room.members.some((m) => m.toString() === userId)) {
      return res
        .status(403)
        .json({ message: "You are not a member of this room" });
    }

    const messages = await Message.find({ room: roomId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sender", "username avatarUrl");

    // reverse to chronological
    messages.reverse();

    return res.json(messages);
  } catch (err) {
    console.error("get messages error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/chat/rooms/:roomId/messages
 * body: { type, text, mediaUrl }
 */
router.post("/rooms/:roomId/messages", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    let { type, text, mediaUrl } = req.body;

    type = type || "text";

    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Chat room not found" });
    }

    if (!room.members.some((m) => m.toString() === userId)) {
      return res
        .status(403)
        .json({ message: "You are not a member of this room" });
    }

    if (type === "text" && (!text || !text.trim())) {
      return res
        .status(400)
        .json({ message: "Text message requires non-empty text" });
    }

    if (type !== "text" && !mediaUrl) {
      return res
        .status(400)
        .json({ message: "Media message requires mediaUrl" });
    }

    const message = await Message.create({
      room: roomId,
      sender: userId,
      type,
      text,
      mediaUrl,
    });

    // touch room.updatedAt so my-rooms sorting works
    room.updatedAt = new Date();
    await room.save();

    const populated = await message.populate("sender", "username avatarUrl");

    return res.status(201).json(populated);
  } catch (err) {
    console.error("send message error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
