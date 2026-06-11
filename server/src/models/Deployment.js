import mongoose from "mongoose";

const LogSchema = new mongoose.Schema({
  level: { type: String, enum: ['info', 'warning', 'error', 'success'], required: true },
  step: { type: String, required: true }, // validation, provider_connection, env_setup, project_create, deploy_trigger, health_check
  message: { type: String, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const DeploymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  
  type: { type: String, enum: ['frontend', 'backend', 'full'], required: true },
  serviceName: { type: String, required: true },
  platform: { type: String, enum: ['vercel', 'netlify', 'railway', 'render', 'none'], required: true },
  status: { type: String, enum: ['queued', 'running', 'success', 'failed', 'cancelled'], default: 'queued' },

  source: {
    repoOwner: { type: String },
    repoName: { type: String },
    repoFullName: { type: String },
    branch: { type: String },
    commitSha: { type: String, default: null },
    rootDirectory: { type: String, default: '/' }
  },

  configSnapshot: {
    installCommand: { type: String },
    buildCommand: { type: String },
    startCommand: { type: String },
    outputDirectory: { type: String },
    envKeys: { type: mongoose.Schema.Types.Mixed, default: {} } // stores keys only, e.g. { frontend: ['VITE_API_URL'] }
  },

  providerProjectId: { type: String },
  providerEnvironmentId: { type: String },
  providerServiceId: { type: String },
  providerDeploymentId: { type: String },
  
  deploymentUrl: { type: String },
  previewUrl: { type: String },
  providerUrl: { type: String },
  providerLogsUrl: { type: String },
  providerDashboardUrl: { type: String },

  logs: [LogSchema],

  errorMessage: { type: String },
  errorCode: { type: String },
  durationMs: { type: Number },

  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model("Deployment", DeploymentSchema);
