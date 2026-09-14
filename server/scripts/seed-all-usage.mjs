import "dotenv/config";
import mongoose from "mongoose";

const TARGET_EMAIL = process.argv[2] || "vs9929947@gmail.com";
const DAYS = 14;

await mongoose.connect(process.env.MONGO_URI);
console.log("Connected to MongoDB");

const UserSchema = new mongoose.Schema({ email: String, name: String });
const ProjectSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  repoName: String,
  repoFullName: String,
  analytics: { enabled: Boolean, verified: Boolean, trackingId: String },
  configuration: { backendPlatform: String, renderServiceId: String, mockBackendUsage: Boolean },
});
const AiUsageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  projectId: mongoose.Schema.Types.ObjectId,
  feature: { type: String, enum: ["auto_pr_fix", "deployment_analysis", "analytics_insight"] },
  tokensUsed: Number,
  source: { type: String, default: "seed" },
}, { timestamps: true });
const AnalyticsEventSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, required: true },
  trackingId: { type: String, required: true },
  eventType: { type: String, enum: ["page_view", "custom"], default: "page_view" },
  eventName: String,
  visitorHash: { type: String, required: true },
  sessionId: String,
  path: { type: String, required: true },
  fullUrl: String, hostname: String, referrer: String,
  environment: { type: String, default: "production" },
  country: String, browser: String, os: String, device: String,
  metadata: Object,
  timestamp: Date,
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const Project = mongoose.models.Project || mongoose.model("Project", ProjectSchema);
const AiUsage = mongoose.models.AiUsage || mongoose.model("AiUsage", AiUsageSchema);
const AnalyticsEvent = mongoose.models.AnalyticsEvent || mongoose.model("AnalyticsEvent", AnalyticsEventSchema);

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function hash(len = 16) { return [...Array(len)].map(() => rnd(0,15).toString(16)).join(""); }
function tsAgo(days, h = 12, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(h, m, 0, 0);
  return d;
}

const user = await User.findOne({ email: TARGET_EMAIL });
if (!user) { console.error("User not found:", TARGET_EMAIL); process.exit(1); }
console.log("Found user:", user.name || user.email, user._id);

const projects = await Project.find({ userId: user._id });
console.log("Projects:", projects.map(p => p.repoName).join(", ") || "none");

// ── AI Usage ──────────────────────────────────────────────────────────────────
await AiUsage.deleteMany({ userId: user._id, source: "seed" });
const featureCounts = {
  analytics_insight:   [5,7,4,9,6,8,11,7,5,10,8,6,9,7],
  deployment_analysis: [3,4,2,5,3,4,6,4,2,5,4,3,5,4],
  auto_pr_fix:         [2,2,1,3,2,3,4,2,1,3,2,2,3,2],
};
const aiRecords = [];
for (let day = 0; day < DAYS; day++) {
  const daysAgo = DAYS - 1 - day;
  for (const [feature, counts] of Object.entries(featureCounts)) {
    const n = counts[day];
    const proj = projects[day % Math.max(projects.length, 1)];
    for (let i = 0; i < n; i++) {
      const ts = tsAgo(daysAgo, 9 + (i % 10), (i * 7) % 60);
      aiRecords.push({ userId: user._id, projectId: proj?._id, feature, tokensUsed: 380 + day * 70 + i * 23, source: "seed", createdAt: ts, updatedAt: ts });
    }
  }
}
await AiUsage.insertMany(aiRecords, { ordered: false });
console.log("AI usage records inserted:", aiRecords.length);

// ── Frontend Analytics ─────────────────────────────────────────────────────────
const pages = ["/", "/dashboard", "/about", "/pricing", "/features", "/blog"];
const browsers = ["Chrome","Firefox","Safari","Edge"];
const oses = ["Windows","macOS","Linux","iOS","Android"];
const devices = ["desktop","mobile","tablet"];
const countries = ["US","IN","GB","DE","CA","AU","FR"];
const referrers = ["https://google.com","https://github.com","https://twitter.com","","",""];

for (const project of projects) {
  const tid = project.analytics?.trackingId || `DEMO-${project._id.toString().slice(-8).toUpperCase()}`;
  await Project.updateOne({ _id: project._id }, { $set: { "analytics.enabled": true, "analytics.verified": true, "analytics.trackingId": tid } });
  await AnalyticsEvent.deleteMany({ projectId: project._id });
  const evts = [];
  for (let day = 0; day < DAYS; day++) {
    const daysAgo = DAYS - 1 - day;
    const visitors = rnd(25, 70) + day;
    for (let v = 0; v < visitors; v++) {
      const vh = hash(); const sid = hash(12);
      const pv = rnd(1,5);
      for (let p = 0; p < pv; p++) {
        const path = pages[rnd(0, pages.length-1)];
        const ts = tsAgo(daysAgo, rnd(7,22), rnd(0,59));
        evts.push({ projectId: project._id, trackingId: tid, eventType: "page_view", visitorHash: vh, sessionId: sid, path, fullUrl: `https://example.com${path}`, hostname: "example.com", referrer: referrers[rnd(0, referrers.length-1)], environment: "production", country: countries[rnd(0,countries.length-1)], browser: browsers[rnd(0,browsers.length-1)], os: oses[rnd(0,oses.length-1)], device: devices[rnd(0,devices.length-1)], timestamp: ts, createdAt: ts, updatedAt: ts });
      }
    }
  }
  await AnalyticsEvent.insertMany(evts, { ordered: false });
  console.log("Analytics events for", project.repoName, ":", evts.length);
}

// ── Backend Usage — mark projects for mock overlay ────────────────────────────
for (const project of projects.slice(0, 2)) {
  await Project.updateOne({ _id: project._id }, { $set: { "configuration.backendPlatform": "render", "configuration.renderServiceId": `mock-${project._id.toString().slice(-8)}`, "configuration.mockBackendUsage": true } });
  console.log("Marked backend mock for:", project.repoName);
}

console.log("Seeding complete!");
await mongoose.disconnect();
