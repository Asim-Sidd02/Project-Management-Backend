import mongoose from "mongoose";

const { Schema } = mongoose;

const messageSchema = new Schema(
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

    // text / image / video / audio
    type: {
      type: String,
      enum: ["text", "image", "video", "audio"],
      default: "text",
    },

    // For normal messages
    text: {
      type: String,
      trim: true,
    },

    // For attachments – URL to your storage (S3 / Cloudinary / Firebase, etc.)
    mediaUrl: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);
export default Message;
