import mongoose from "mongoose";

const monitorCheckSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  monitorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Monitor',
    required: true
  },
  url: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'degraded'],
    required: true
  },
  statusCode: {
    type: Number
  },
  responseTimeMs: {
    type: Number
  },
  errorMessage: {
    type: String
  },
  checkedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for fetching recent checks efficiently
monitorCheckSchema.index({ monitorId: 1, checkedAt: -1 });

const MonitorCheck = mongoose.model("MonitorCheck", monitorCheckSchema);
export default MonitorCheck;
