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
  platform: { type: String, enum: ['vercel', 'netlify', 'railway', 'render', 'none', 'multiple'], required: true },
  status: { type: String, enum: ['queued', 'running', 'success', 'completed', 'failed', 'cancelled'], default: 'queued' },
  orchestrationGroupId: { type: String, index: true },
  triggerReason: {
    type: String,
    enum: [
      "manual",
      "initial_deploy",
      "domain_primary_verified",
      "domain_alias_cors_update",
      "domain_make_primary",
      "domain_removed",
      "domain_removed_cors_update",
      "domain_redirect_enabled",
      "domain_redirect_disabled",
      "retry"
    ],
    default: "manual"
  },

  source: {
    repoOwner: { type: String },
    repoName: { type: String },
    repoFullName: { type: String },
    branch: { type: String },
    commitSha: { type: String, default: null },
    commitMessage: { type: String, default: null },
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

  healthCheck: {
    backend: {
      status: { type: String, enum: ['passed', 'warning', 'failed', 'skipped'] },
      url: { type: String },
      endpoint: { type: String },
      statusCode: { type: Number },
      message: { type: String },
      checkedAt: { type: Date }
    },
    frontend: {
      status: { type: String, enum: ['passed', 'warning', 'failed', 'skipped'] },
      url: { type: String },
      statusCode: { type: Number },
      message: { type: String },
      checkedAt: { type: Date }
    },
    cors: {
      status: { type: String, enum: ['passed', 'warning', 'failed', 'skipped'] },
      frontendUrl: { type: String },
      backendUrl: { type: String },
      message: { type: String },
      checkedAt: { type: Date }
    },
    database: {
      status: { type: String, enum: ['passed', 'warning', 'failed', 'skipped', 'unknown'] },
      message: { type: String },
      checkedAt: { type: Date }
    }
  },

  finalSummary: {
    frontendUrl: { type: String },
    backendUrl: { type: String },
    frontendDashboardUrl: { type: String },
    backendDashboardUrl: { type: String },
    status: { type: String },
    durationMs: { type: Number },
    failedStep: { type: String },
    failureReason: { type: String },
    suggestedFix: { type: String },
    screenshotUrl: { type: String }
  },

  errorMessage: { type: String },
  errorCode: { type: String },
  durationMs: { type: Number },

  retryOfDeploymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deployment' },

  domainSnapshot: {
    frontendPrimaryDomain: { type: String },
    backendPrimaryDomain: { type: String },
    corsOrigins: [{ type: String }],
    apiUrl: { type: String }
  },

  aiAnalysis: {
    summary: { type: String },
    likelyCause: { type: String },
    failedStep: { type: String },
    suggestedFixes: [{ type: String }],
    severity: { type: String, enum: ['low', 'medium', 'high'] },
    canAutoFix: { type: Boolean, default: false },
    fixType: { type: String, enum: ['missing_health_route', 'cors_origin', 'build_error', 'port_binding_error', 'unknown'] },
    fixPlan: {
      targetFiles: [{ type: String }],
      changes: [{ type: String }]
    },
    fixStatus: { type: String, enum: ['not_requested', 'pr_created', 'failed', 'merged_unknown'], default: 'not_requested' },
    failureCategory: { type: String, enum: ['repo_issue', 'config_issue', 'provider_issue', 'platform_internal_bug', 'unknown'] },
    userAction: { type: String, enum: ['create_fix_pr', 'update_config', 'reconnect_provider', 'contact_support', 'retry'] },
    configFixSuggestion: {
      fieldPath: { type: String },
      currentValue: { type: mongoose.Schema.Types.Mixed },
      suggestedValue: { type: mongoose.Schema.Types.Mixed },
      reason: { type: String },
      confidence: { type: String, enum: ['low', 'medium', 'high'] }
    },
    generatedAt: { type: Date }
  },

  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model("Deployment", DeploymentSchema);
