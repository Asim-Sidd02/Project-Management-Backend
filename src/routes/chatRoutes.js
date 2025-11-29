import express from "express";
import ChatRoom from "../models/ChatRoom.js";
import Message from "../models/Message.js";
import { auth as requireAuth } from "../middleware/auth.js";
import Project from "../models/Project.js";
import { getIO } from "../socket.js";
import mongoose from "mongoose";

const router = express.Router();

/**
 * GET /api/chat/my-rooms
 * All chat rooms where current user is a member
 */
router.get("/my-rooms", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 1) Find rooms where this user is a member
    const rooms = await ChatRoom.find({ members: userId })
      .populate("project", "name")
      .sort({ updatedAt: -1 })
      .lean(); // plain JS objects

    if (rooms.length === 0) {
      return res.json([]);
    }

    const roomIds = rooms.map((r) => r._id);

    // 2) Get last message per room
    const lastMessages = await Message.aggregate([
      { $match: { room: { $in: roomIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$room",
          lastText: { $first: "$text" },
          lastType: { $first: "$type" },
          lastCreatedAt: { $first: "$createdAt" },
        },
      },
    ]);

    // 3) Get unread count per room for this user
    const unreadCounts = await Message.aggregate([
      {
        $match: {
          room: { $in: roomIds },
          sender: { $ne: userObjectId },
          seenBy: { $ne: userObjectId },
        },
      },
      {
        $group: {
          _id: "$room",
          count: { $sum: 1 },
        },
      },
    ]);

    const lastByRoom = new Map();
    lastMessages.forEach((lm) => {
      lastByRoom.set(lm._id.toString(), lm);
    });

    const unreadByRoom = new Map();
    unreadCounts.forEach((u) => {
      unreadByRoom.set(u._id.toString(), u.count);
    });

    // 4) Merge into rooms
    const result = rooms.map((r) => {
      const idStr = r._id.toString();
      const lm = lastByRoom.get(idStr);
      const unread = unreadByRoom.get(idStr) || 0;

      let lastMessageText = "";
      if (lm) {
        if (lm.lastText && lm.lastText.trim().length > 0) {
          lastMessageText = lm.lastText.trim();
        } else {
          // fallback text based on type
          const type = lm.lastType || "text";
          switch (type) {
            case "image":
              lastMessageText = "📷 Photo";
              break;
            case "video":
              lastMessageText = "🎬 Video";
              break;
            case "audio":
              lastMessageText = "🎙 Voice message";
              break;
            case "file":
              lastMessageText = "📎 File";
              break;
            default:
              lastMessageText = "";
          }
        }
      }

      // If you want project name flat like before:
      const projectName =
        r.project && typeof r.project === "object" ? r.project.name : undefined;

      return {
        ...r,
        projectName,
        unreadCount: unread,
        lastMessageText,
        lastMessageAt: lm?.lastCreatedAt || r.updatedAt,
      };
    });

    return res.json(result);
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
    const userId = req.user._id;
    const { projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // ensure user is a member of the project
    const isMember =
      project.owner.toString() === userId.toString() ||
      project.members.some((m) => m.user.toString() === userId.toString());

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
    console.error("project room error:", err.message);
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
    const userId = req.user._id;

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
    console.error("create room error:", err.message);
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

    if (!room.members.some((m) => m.toString() === userId)) {
      return res
        .status(403)
        .json({ message: "You are not a member of this room" });
    }

    // ✅ fetch last messages
    const messages = await Message.find({ room: roomId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sender", "username avatarUrl");

    messages.reverse();

    // ✅ mark all non-self messages as seen
    await Message.updateMany(
      {
        room: roomId,
        sender: { $ne: userId },
        seenBy: { $ne: userId },
      },
      {
        $addToSet: { seenBy: userId },
      }
    );

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
    const userId = req.user._id;
    const { roomId } = req.params;
    let { type, text, mediaUrl } = req.body;

    type = type || "text";

    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Chat room not found" });
    }

    const isMember = room.members.some(
      (m) => m.toString() === userId.toString()
    );
    if (!isMember) {
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

room.updatedAt = new Date();
await room.save();

const populated = await message.populate("sender", "username avatarUrl");

// 🔥 Emit real-time event to all clients in this room
try {
  const io = getIO();
  io.to(roomId.toString()).emit("message:new", populated);
} catch (e) {
  console.error("Socket emit error:", e.message);
}

return res.status(201).json(populated);

  } catch (err) {
    console.error("send message error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
