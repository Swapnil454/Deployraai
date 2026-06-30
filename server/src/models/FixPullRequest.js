import mongoose from "mongoose";

const LogSchema = new mongoose.Schema({
  step: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const FixPullRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  deploymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deployment', required: true },
  
  provider: { type: String, default: 'github' },
  status: { 
    type: String, 
    enum: ['planned', 'branch_created', 'committed', 'pr_created', 'failed'], 
    default: 'planned' 
  },
  
  fixType: { type: String, required: true },
  branchName: { type: String },
  pullRequestUrl: { type: String },
  pullRequestNumber: { type: Number },
  
  filesChanged: [{ type: String }],
  logs: [LogSchema],
  errorMessage: { type: String },
  
}, { timestamps: true });

FixPullRequestSchema.index({ projectId: 1, createdAt: -1 });
FixPullRequestSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("FixPullRequest", FixPullRequestSchema);
