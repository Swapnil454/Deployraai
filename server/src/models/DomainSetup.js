import mongoose from "mongoose";

const DomainSetupSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
  },
  rootDomain: {
    type: String,
    required: true,
  },
  frontendDomain: String,
  wwwDomain: String,
  backendDomain: String,
  
  frontendProvider: String, // e.g., 'vercel'
  backendProvider: String,  // e.g., 'render', 'railway'
  
  providerProjectId: String,
  providerFrontendDomainId: String,
  providerBackendDomainId: String,
  
  status: {
    type: String,
    enum: ["draft", "provider_added", "pending_dns", "verifying", "active", "partially_active", "failed"],
    default: "draft",
  },
  
  frontendVerification: {
    type: String,
    enum: ["pending", "verified", "failed"],
    default: "pending",
  },
  backendVerification: {
    type: String,
    enum: ["pending", "verified", "failed", "manual_setup_required"],
    default: "pending",
  },
  
  dnsRecords: [
    {
      type: { type: String, enum: ["A", "CNAME", "TXT", "ALIAS", "ANAME"] },
      name: String,
      value: String,
      purpose: String, // e.g., "frontend", "www", "backend", "verification"
      status: { type: String, enum: ["pending", "verified", "failed"], default: "pending" }
    }
  ],
  
  sslStatus: String,
  verificationLogs: [String],
  failureReason: String,
  lastVerifiedAt: Date,
}, { timestamps: true });

export default mongoose.model("DomainSetup", DomainSetupSchema);
