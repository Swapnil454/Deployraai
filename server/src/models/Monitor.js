import mongoose from "mongoose";

const monitorSchema = new mongoose.Schema({
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
  domainSetupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DomainSetup'
  },
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['frontend', 'backend'],
    required: true
  },
  url: {
    type: String,
    required: true
  },
  healthPath: {
    type: String,
    default: '/'
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'degraded', 'paused', 'pending'],
    default: 'pending'
  },
  lastStatusCode: {
    type: Number
  },
  lastResponseTimeMs: {
    type: Number
  },
  lastCheckedAt: {
    type: Date
  },
  uptimePercentage: {
    type: Number,
    default: 100
  },
  totalChecks: {
    type: Number,
    default: 0
  },
  successfulChecks: {
    type: Number,
    default: 0
  },
  failedChecks: {
    type: Number,
    default: 0
  },
  consecutiveFailures: {
    type: Number,
    default: 0
  },
  lastErrorMessage: {
    type: String
  },
  isEnabled: {
    type: Boolean,
    default: true
  },
  lastAlertSentAt: {
    type: Date
  },
  alertCount: {
    type: Number,
    default: 0
  },
  alertStatus: {
    type: String,
    enum: ['none', 'sent', 'recovered'],
    default: 'none'
  }
}, { timestamps: true });

// Prevent duplicate monitors per project+type+url
monitorSchema.index({ projectId: 1, type: 1, url: 1 }, { unique: true });

const Monitor = mongoose.model("Monitor", monitorSchema);
export default Monitor;
