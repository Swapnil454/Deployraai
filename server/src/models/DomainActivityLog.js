import mongoose from "mongoose";

const DomainActivityLogSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true
    },
    domainSetupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DomainSetup",
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    action: {
      type: String,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["success", "warning", "error", "pending"],
      default: "pending"
    },
    message: {
      type: String,
      required: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

DomainActivityLogSchema.index({
  domainSetupId: 1,
  createdAt: -1
});

export default mongoose.models.DomainActivityLog || mongoose.model("DomainActivityLog", DomainActivityLogSchema);
