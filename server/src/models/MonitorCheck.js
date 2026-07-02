import mongoose from "mongoose";

const monitorCheckSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  monitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Monitor', required: true },
  url: { type: String, required: true },
  status: { type: String, enum: ['online', 'offline', 'degraded'], required: true },
  statusCode: { type: Number },
  responseTimeMs: { type: Number },
  errorMessage: { type: String },
  checkedAt: { type: Date, default: Date.now }
});

// Index for querying checks by monitor over time
monitorCheckSchema.index({ monitorId: 1, checkedAt: -1 });

// TTL index: MongoDB automatically deletes MonitorCheck documents older than 30 days.
// Without this, every 5-minute check generates a new document forever.
// At 100 monitors × 12 checks/hr × 24hrs × 365 days = ~10.5M docs/year (~4GB).
// This single index prevents unbounded MongoDB OOM growth with zero application code changes.
monitorCheckSchema.index({ checkedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const MonitorCheck = mongoose.model("MonitorCheck", monitorCheckSchema);
export default MonitorCheck;
