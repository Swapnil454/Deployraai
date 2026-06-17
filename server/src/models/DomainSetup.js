import mongoose from "mongoose";

const verificationLogSchema = new mongoose.Schema({
  message: { type: String, required: true },
  level:   { type: String, enum: ["info", "warn", "error"], default: "info" },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const dnsRecordSchema = new mongoose.Schema({
  type:    { type: String, enum: ["A", "CNAME", "TXT", "ALIAS", "ANAME"] },
  name:    String,
  value:   String,
  purpose: String, // e.g., "frontend", "www", "backend", "frontend_verification"
  status:  { type: String, enum: ["pending", "verified", "failed", "conflict"], default: "pending" },
}, { _id: true });

const DomainSetupSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
    index: true,
  },
  rootDomain: {
    type: String,
    required: true,
  },
  frontendDomain: String,
  wwwDomain: String,
  backendDomain: String,

  frontendProvider: String, // e.g., 'vercel'
  backendProvider:  String, // e.g., 'render', 'railway'

  providerProjectId:       String,
  providerFrontendDomainId: String,
  providerBackendDomainId:  String,

  status: {
    type: String,
    enum: [
      "draft",
      "provider_added",
      "pending_dns",
      "verifying",
      "active",
      "partially_active",
      "degraded",   // Was active; DNS records were subsequently removed
      "failed",
    ],
    default: "draft",
    index: true,
  },

  frontendVerification: {
    type: String,
    enum: ["pending", "verified", "failed", "degraded"],
    default: "pending",
  },
  backendVerification: {
    type: String,
    enum: ["pending", "verified", "failed", "degraded", "manual_setup_required"],
    default: "pending",
  },

  // Health tracking
  consecutiveFailures: { type: Number, default: 0 },
  degradedAt:          { type: Date },

  // Redirect tracking
  isRedirect:     { type: Boolean, default: false },
  redirectStatus: String,
  redirectTarget: String,

  dnsRecords: [dnsRecordSchema],

  sslStatus:        String,
  verificationLogs: [verificationLogSchema],   // Structured, replaces plain [String]
  failureReason:    String,
  lastVerifiedAt:   Date,
}, { timestamps: true });

// ─── Indexes ────────────────────────────────────────────────────────────────
// Prevent the same root domain from being simultaneously active in multiple
// projects (even across different users). A partial unique index only applies
// to documents where the field equals a specific value, but Mongo sparse unique
// indexes are per-document. Instead we enforce this in application code
// (checked inside addCustomDomain) for maximum compatibility.
DomainSetupSchema.index({ rootDomain: 1, status: 1 });          // fast health-cron queries
DomainSetupSchema.index({ projectId: 1, rootDomain: 1 });       // idempotency lookup

export default mongoose.model("DomainSetup", DomainSetupSchema);
