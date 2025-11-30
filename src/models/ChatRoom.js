import mongoose from "mongoose";

const { Schema } = mongoose;

const chatRoomSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // For project-based group chats
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },

    isProjectRoom: {
      type: Boolean,
      default: false,
    },

    // Members of this room (users)
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Who created this room (for custom groups)
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const ChatRoom = mongoose.model("ChatRoom", chatRoomSchema);
export default ChatRoom;
