import mongoose from "mongoose";

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "leader", "member"], default: "member" }
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    chatRoom: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "ChatRoom",
  default: null,
},
    members: [memberSchema]
    
  },
  { timestamps: true }
);

const Project = mongoose.model("Project", projectSchema);
export default Project;
