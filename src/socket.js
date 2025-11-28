// src/socket.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "./models/User.js";

let ioInstance = null;

// In-memory presence store: userId -> number of active sockets
const onlineUsers = new Map();

export function initSocket(server) {
  ioInstance = new Server(server, {
    cors: {
      origin: "*", // for now allow all (Flutter app, etc.)
      methods: ["GET", "POST"],
    },
  });

  // Auth middleware for socket.io
  ioInstance.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token || socket.handshake.query?.token;

      if (!token) {
        return next(new Error("No auth token"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id || decoded._id).select(
        "_id username avatarUrl"
      );

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.user = {
        id: user._id.toString(),
        username: user.username,
        avatarUrl: user.avatarUrl || "",
      };

      next();
    } catch (err) {
      console.error("Socket auth error:", err.message);
      next(new Error("Authentication error"));
    }
  });

  ioInstance.on("connection", (socket) => {
    const user = socket.user;
    if (!user) return;

    console.log("🔌 Socket connected:", user.username, socket.id);

    // presence: mark online
    _setUserOnline(user.id, true);

    // Client asks to join a room (chat room id)
    socket.on("joinRoom", ({ roomId }) => {
      if (!roomId) return;
      socket.join(roomId.toString());
      console.log(`➡️ ${user.username} joined room ${roomId}`);
    });

    socket.on("leaveRoom", ({ roomId }) => {
      if (!roomId) return;
      socket.leave(roomId.toString());
      console.log(`⬅️ ${user.username} left room ${roomId}`);
    });

    // typing indicator
    socket.on("typing", ({ roomId, isTyping }) => {
      if (!roomId) return;
      socket.to(roomId.toString()).emit("typing", {
        roomId: roomId.toString(),
        userId: user.id,
        username: user.username,
        isTyping: !!isTyping,
      });
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected:", user.username, socket.id);
      _setUserOnline(user.id, false);
    });
  });

  console.log("✅ Socket.io initialized");
}

function _setUserOnline(userId, online) {
  const current = onlineUsers.get(userId) || 0;
  let newCount = current;

  if (online) {
    newCount = current + 1;
  } else {
    newCount = Math.max(0, current - 1);
  }

  onlineUsers.set(userId, newCount);

  const isNowOnline = newCount > 0;

  // broadcast presence update to everyone
  if (ioInstance) {
    ioInstance.emit("presence:update", {
      userId,
      online: isNowOnline,
    });
  }
}

export function getIO() {
  if (!ioInstance) {
    throw new Error("Socket.io not initialized");
  }
  return ioInstance;
}
