// models/Message.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const MessageSchema = new Schema(
  {
    room: {
      type: Schema.Types.ObjectId,
      ref: "ChatRoom",
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["text", "image", "video", "audio", "file"],
      default: "text",
    },
    text: { type: String },
    mediaUrl: { type: String },

    // 👇 NEW: who has already seen this message
    seenBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", MessageSchema);
export default Message;
