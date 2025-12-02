import express from "express";
import ChatRoom from "../models/ChatRoom.js";
import Message from "../models/Message.js";
import { auth as requireAuth } from "../middleware/auth.js";
import Project from "../models/Project.js";
import { getIO } from "../socket.js";
import mongoose from "mongoose";
import { sendPushToUserIds } from "./../pushService.js";



const router = express.Router();

/**
 * GET /api/chat/my-rooms
 * All chat rooms where current user is a member
 */
router.get("/my-rooms", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const rooms = await ChatRoom.find({ members: userId })
      .populate("members", "username avatarUrl")
      .populate("project", "name")
      .sort({ updatedAt: -1 })
      .lean();

    if (!rooms.length) {
      return res.json([]);
    }

    const roomIds = rooms.map((r) => r._id);

    // last message per room
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

    // unread count per room
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

    const result = rooms.map((r) => {
      const idStr = r._id.toString();
      const lm = lastByRoom.get(idStr);
      const unread = unreadByRoom.get(idStr) || 0;

      // last message preview
      let lastMessageText = "";
      if (lm) {
        if (lm.lastText && lm.lastText.trim().length > 0) {
          lastMessageText = lm.lastText.trim();
        } else {
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

      // display name + avatar
      const members = r.members || [];
      const isProjectRoom = !!r.isProjectRoom;
      const isGroupExplicit = r.isGroup ?? false;

      let isGroup = isGroupExplicit;
      if (!isProjectRoom && members.length > 2) {
        isGroup = true;
      }

      let displayName = r.name;
      let avatarBase64 = r.avatarUrl || null;

      if (isProjectRoom && r.project && typeof r.project === "object") {
        displayName = r.project.name || displayName;
      }

      if (!isProjectRoom && !isGroup && members.length >= 2) {
        const userIdStr = userId.toString();
        const other = members.find(
          (m) => m._id.toString() !== userIdStr
        );
        if (other) {
          displayName = other.username || displayName;
          if (other.avatarUrl) {
            avatarBase64 = other.avatarUrl;
          }
        }
      }

      const projectName =
        r.project && typeof r.project === "object" ? r.project.name : undefined;

      return {
        id: r._id,
        name: displayName,
        isProjectRoom,
        projectName,
        isGroup,
        avatarBase64,
        unreadCount: unread,
        lastMessageText,
        lastMessageAt: lm?.lastCreatedAt || r.updatedAt,
        updatedAt: r.updatedAt,
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
 */
router.get("/project/:projectId/room", requireAuth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

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
 */
router.post("/rooms", requireAuth, async (req, res) => {
  try {
    const { name, memberIds = [] } = req.body;
    const userId = req.user._id;

    if (!name) {
      return res.status(400).json({ message: "Room name is required" });
    }

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

    const messages = await Message.find({ room: roomId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sender", "username avatarUrl");

    messages.reverse();

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

    // 1) Create message
    const message = await Message.create({
      room: roomId,
      sender: userId,
      type,
      text,
      mediaUrl,
    });

    // 2) Update room timestamp
    room.updatedAt = new Date();
    await room.save();

    // 3) Populate sender fields (username, avatarUrl)
    const populated = await message.populate("sender", "username avatarUrl");

    // 4) Emit real-time message over Socket.IO
   // 🔥 Emit real-time event to all clients in this room
try {
  const io = getIO();
  io.to(roomId.toString()).emit("message:new", populated);
} catch (e) {
  console.error("Socket emit error:", e.message);
}

// 5) Send push notifications to other members
try {
  // all room members except the sender
  const recipientIds = room.members
    .map((m) => m.toString())
    .filter((id) => id !== userId.toString());

  console.log("🔔 Chat push recipients:", recipientIds);

  if (recipientIds.length > 0) {
    const senderName = populated.sender?.username || "New message";

    let body = "";
    switch (type) {
      case "image":
        body = "📷 Photo";
        break;
      case "video":
        body = "🎬 Video";
        break;
      case "audio":
        body = "🎙 Voice message";
        break;
      case "file":
        body = "📎 File";
        break;
      default:
        body = text || "New message";
    }

    await sendPushToUserIds(recipientIds, {
      title: senderName,
      body,
      data: {
        type: "chat",
        roomId: roomId.toString(),
      },
    });
  }
} catch (e) {
  console.error("Chat push error:", e.message);
}


    // 6) Final API response
    return res.status(201).json(populated);
  } catch (err) {
    console.error("send message error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
});


export default router;
