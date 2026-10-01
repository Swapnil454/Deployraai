import mongoose from "mongoose";

const monitorCheckSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  monitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Monitor', required: true },
  url: { type: String, required: true },
  status: { type: String, enum: ['online', 'offline', 'degraded'], required: true },
  statusCode: { type: Number },
  responseTimeMs: { type: Number },
  errorMessage: { type: String },
  checkedAt: { type: Date, default: Date.now },
  aiAnalysis: {
    summary: { type: String },
    likelyCause: { type: String },
    suggestedFix: { type: String },
    canAutoFix: { type: Boolean, default: false },
    fix_pr_url: { type: String },
    generatedAt: { type: Date }
  }
});

// Index for querying checks by monitor over time
monitorCheckSchema.index({ monitorId: 1, checkedAt: -1 });

// Raw checks are retained for the longest period offered in the UI: 30 days.
// A startup migration keeps the existing MongoDB TTL index aligned with that policy.
// The TTL index bounds growth while retaining the full data window users can select.
const MonitorCheck = mongoose.model("MonitorCheck", monitorCheckSchema);

// Update the old TTL index with collMod rather than declaring it in the schema.
// This prevents an index-option conflict on deployments created with 30-day retention.
export const ensureMonitorCheckRetention = async () => {
  const retentionSeconds = 30 * 24 * 60 * 60;
  const collection = MonitorCheck.collection;
  let indexes = [];
  try {
    indexes = await collection.indexes();
  } catch (error) {
    // A fresh MongoDB database has no collection to list yet; createIndex below creates it.
    if (error.codeName !== 'NamespaceNotFound') throw error;
  }
  const ttlIndex = indexes.find(index => index.key?.checkedAt === 1 && index.expireAfterSeconds != null);

  if (ttlIndex) {
    if (ttlIndex.expireAfterSeconds !== retentionSeconds) {
      await mongoose.connection.db.command({
        collMod: collection.collectionName,
        index: { name: ttlIndex.name, expireAfterSeconds: retentionSeconds }
      });
    }
    return;
  }

  await collection.createIndex(
    { checkedAt: 1 },
    { name: 'monitor_check_retention', expireAfterSeconds: retentionSeconds }
  );
};

export default MonitorCheck;
