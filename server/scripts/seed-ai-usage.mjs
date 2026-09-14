import "dotenv/config";
import mongoose from "mongoose";
import AiUsage from "../src/models/AiUsage.js";
import Project from "../src/models/Project.js";

const projectId = process.argv[2] || "6aa6c88d397c2ec071a05583";
const dailyUsage = [
  { analytics_insight: 7, deployment_analysis: 4, auto_pr_fix: 2 },
  { analytics_insight: 9, deployment_analysis: 5, auto_pr_fix: 3 },
  { analytics_insight: 6, deployment_analysis: 3, auto_pr_fix: 2 },
  { analytics_insight: 11, deployment_analysis: 6, auto_pr_fix: 4 },
  { analytics_insight: 8, deployment_analysis: 5, auto_pr_fix: 3 },
  { analytics_insight: 12, deployment_analysis: 7, auto_pr_fix: 4 },
  { analytics_insight: 10, deployment_analysis: 6, auto_pr_fix: 3 },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);

  const project = await Project.findById(projectId).select("userId");
  if (!project) throw new Error(`Project ${projectId} was not found.`);

  await AiUsage.deleteMany({ projectId: project._id, source: "seed" });

  const records = dailyUsage.flatMap((usage, dayIndex) => {
    const date = new Date();
    date.setDate(date.getDate() - (dailyUsage.length - 1 - dayIndex));
    return Object.entries(usage).flatMap(([feature, count], featureIndex) => Array.from({ length: count }, (_, eventIndex) => {
      const timestamp = new Date(date);
      timestamp.setHours(9 + ((eventIndex + featureIndex * 3) % 10), (eventIndex * 11) % 60, 0, 0);
      return {
        userId: project.userId,
        projectId: project._id,
        feature,
        tokensUsed: 400 + ((dayIndex + 1) * 71) + eventIndex * 19,
        source: "seed",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    }));
  });

  await AiUsage.insertMany(records, { ordered: false });
  console.log(`Seeded ${records.length} mock AI usage events for project ${projectId}.`);
}

seed()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
