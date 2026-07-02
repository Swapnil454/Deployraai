import mongoose from "mongoose";

const aiUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: false,
    },
    feature: {
      type: String,
      enum: ["auto_pr_fix", "deployment_analysis", "analytics_insight"],
      required: true,
    },
    tokensUsed: {
      type: Number,
      required: false,
    },
  },
  { timestamps: true }
);

aiUsageSchema.index({ projectId: 1, createdAt: -1 });

export default mongoose.models.AiUsage || mongoose.model("AiUsage", aiUsageSchema);
