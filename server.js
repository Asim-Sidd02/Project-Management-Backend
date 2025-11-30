// server.js
import express from "express";
import { createServer } from "http";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import { initSocket } from "./src/socket.js";

// NOTE: adjust paths so everything is under ./src
import authRoutes from "./src/routes/authRoutes.js";
import projectRoutes from "./src/routes/projectRoutes.js";
import taskRoutes from "./src/routes/taskRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import chatRoutes from "./src/routes/chatRoutes.js";
import notificationRoutes from "./src/routes/notificationRoutes.js";
dotenv.config();

const app = express();
const httpServer = createServer(app); // 👈 http server for socket.io
app.use("/api/notifications", notificationRoutes);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// routes
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not defined in environment variables");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Sentinel API running" });
});

const PORT = process.env.PORT || 5000;

// 👇 Initialize socket.io on the http server
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`🚀 Server + Socket running on port ${PORT}`);
});
