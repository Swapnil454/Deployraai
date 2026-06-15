import mongoose from "mongoose";

const connectedAccountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provider: {
    type: String,
    enum: ['github', 'vercel', 'netlify', 'railway', 'render', 'cloudflare'],
    required: true
  },
  providerType: {
    type: String,
    enum: ['oauth', 'api_key'],
    required: true
  },
  status: {
    type: String,
    enum: ['connected', 'expired', 'disconnected', 'error'],
    default: 'connected'
  },
  providerAccountId: {
    type: String
  },
  providerAccountName: {
    type: String
  },
  accessTokenEncrypted: {
    type: String,
    required: true
  },
  refreshTokenEncrypted: {
    type: String
  },
  tokenExpiresAt: {
    type: Date
  },
  scopes: {
    type: [String],
    default: []
  },
  metadata: {
    type: Object,
    default: {}
  },
  connectedAt: {
    type: Date,
    default: Date.now
  },
  lastUsedAt: {
    type: Date
  }
}, { timestamps: true });

// Prevent multiple active connections of the same provider per user
connectedAccountSchema.index({ userId: 1, provider: 1 }, { unique: true });

const ConnectedAccount = mongoose.model("ConnectedAccount", connectedAccountSchema);
export default ConnectedAccount;
