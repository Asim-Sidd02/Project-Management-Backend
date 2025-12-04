import express from "express";
import ChatRoom from "../models/ChatRoom.js";
import Message from "../models/Message.js";
import { auth as requireAuth } from "../middleware/auth.js";
import Project from "../models/Project.js";
import { getIO } from "../socket.js";
import mongoose from "mongoose";
import { sendPushToUser } from "../oneSignalService.js";



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
    let { type, text, mediaUrl, oneSignalPlayerId } = req.body; // 👈 add this

    type = type || "text";

    const room = await ChatRoom.findById(roomId).populate(
      "members",
      "username oneSignalIds"
    );
    if (!room) {
      return res.status(404).json({ message: "Chat room not found" });
    }

    const isMember = room.members.some(
      (m) => m._id.toString() === userId.toString()
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

    // 🔥 Socket emit
    try {
      const io = getIO();
      io.to(roomId.toString()).emit("message:new", populated);
    } catch (e) {
      console.error("Socket emit error:", e.message);
    }

    // 🔔 OneSignal push to other members
    try {
      const senderName = populated.sender?.username || "Someone";

      let preview = "";
      switch (type) {
        case "image":
          preview = "📷 sent a photo";
          break;
        case "video":
          preview = "🎬 sent a video";
          break;
        case "audio":
          preview = "🎙 sent a voice message";
          break;
        case "file":
          preview = "📎 sent a file";
          break;
        default:
          preview = text || "New message";
      }

      const heading = room.isProjectRoom
        ? `Project: ${room.name}`
        : `New message from ${senderName}`;

      for (const member of room.members) {
        // still skip sender as user (optional but safe)
        // const isSender = member._id.toString() === userId.toString();
          if (member._id.toString() === userId.toString()) continue;
        await sendPushToUser(member, {
          heading,
          content: preview,
          data: {
            type: "chat",
            roomId: roomId.toString(),
          },
          // ❗ If this member *is* the sender, exclude the current device
          excludePlayerId: isSender ? oneSignalPlayerId : undefined,
        });
      }
    } catch (err) {
      console.error("Chat push error:", err.message);
    }

    return res.status(201).json(populated);
  } catch (err) {
    console.error("send message error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
});


export default router;
