import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, required: true, unique: true },
  avatar: { type: String },
  provider: { type: String, default: 'github' },
  githubId: { type: String, required: true, unique: true },
  githubUsername: { type: String },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  
  // Connection Statuses
  githubConnected: { type: Boolean, default: true },
  vercelConnected: { type: Boolean, default: false },
  renderConnected: { type: Boolean, default: false },
  cloudflareConnected: { type: Boolean, default: false },
  
  // Encrypted Credentials
  githubAccessTokenEncrypted: { type: String },
  githubScopes: { type: [String], default: [] },
  githubTokenLastUpdatedAt: { type: Date }
}, {
  timestamps: true
});

export default mongoose.model("User", UserSchema);
