import mongoose from "mongoose";

const EnvVariableSchema = new mongoose.Schema({
  key: { type: String, required: true },
  valueEncrypted: { type: String, required: true },
  isSecret: { type: Boolean, default: true }
}, { _id: false });

const ProjectSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  repoProvider: { type: String, default: 'github' },
  repoOwner: { type: String, required: true },
  repoName: { type: String, required: true },
  repoFullName: { type: String, required: true },
  repoUrl: { type: String },
  selectedBranch: { type: String, required: true },
  defaultBranch: { type: String },
  
  analysis: { type: mongoose.Schema.Types.Mixed }, // Stores the detailed tree analysis results

  status: { 
    type: String, 
    enum: ['analyzed', 'configuring', 'configured', 'deploying', 'deployed', 'failed'], 
    default: 'analyzed' 
  },

  slug: {
    type: String,
    unique: true,
    sparse: true, // null until user enables status page
  },
  
  statusPageEnabled: {
    type: Boolean,
    default: false
  },

  analytics: {
    enabled: {
      type: Boolean,
      default: false,
    },
    trackingId: {
      type: String,
      unique: true,
      sparse: true,
    },
    rumWriteKey: {
      type: String,
      unique: true,
      sparse: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    enabledAt: Date,
  },

  configuration: {
    frontendPlatform: { type: String, enum: ['vercel', 'netlify', 'none'], default: 'none' },
    backendPlatform: { type: String, enum: ['render', 'railway', 'none'], default: 'none' },
    databasePlatform: { type: String, enum: ['mongodb_atlas', 'supabase', 'external', 'none'], default: 'none' },
    storagePlatform: { type: String, enum: ['cloudflare_r2', 'cloudinary', 'none'], default: 'none' },

    frontendRoot: { type: String, default: '/' },
    backendRoot: { type: String, default: '/' },
    frontendBuildCommand: { type: String },
    backendBuildCommand: { type: String },
    backendStartCommand: { type: String },
    installCommand: { type: String },
    outputDirectory: { type: String },
    
    vercelProjectId: { type: String },
    renderServiceId: { type: String },
    railwayProjectId: { type: String },

    envVariables: {
      frontend: [EnvVariableSchema],
      backend: [EnvVariableSchema],
      shared: [EnvVariableSchema]
    }
  }
}, {
  timestamps: true
});

ProjectSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Project", ProjectSchema);
