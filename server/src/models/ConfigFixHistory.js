import mongoose from "mongoose";

const ConfigFixHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  deploymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deployment', required: true },
  
  fieldPath: { type: String, required: true },
  previousValue: { type: mongoose.Schema.Types.Mixed },
  newValue: { type: mongoose.Schema.Types.Mixed },
  reason: { type: String },
  appliedAt: { type: Date, default: Date.now }
});

ConfigFixHistorySchema.index({ projectId: 1, appliedAt: -1 });
ConfigFixHistorySchema.index({ userId: 1, appliedAt: -1 });

export default mongoose.model("ConfigFixHistory", ConfigFixHistorySchema);
