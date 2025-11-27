import mongoose from "mongoose";

const invitationSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ["leader", "member"], default: "member" },
    token: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "expired"],
      default: "pending"
    },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Invitation = mongoose.model("Invitation", invitationSchema);
export default Invitation;
