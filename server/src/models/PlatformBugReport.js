import mongoose from "mongoose";

const PlatformBugReportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  deploymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deployment', required: true },
  
  errorMessage: { type: String, required: true },
  stackTraceSanitized: { type: String },
  sanitizedLogs: { type: mongoose.Schema.Types.Mixed }, // Array of sanitized logs
  
  failedStep: { type: String },
  
  status: { 
    type: String, 
    enum: ['open', 'investigating', 'fixed', 'ignored'], 
    default: 'open' 
  },
  severity: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'], 
    default: 'high' 
  }
}, { timestamps: true });

export default mongoose.model("PlatformBugReport", PlatformBugReportSchema);
