import AiUsage from '../models/AiUsage.js';

export const trackAiUsage = async (userId, projectId, feature) => {
  try {
    if (!userId || !feature) return;
    
    await AiUsage.create({
      userId,
      projectId: projectId || null,
      feature
    });
  } catch (error) {
    console.error(`[AI Tracker] Failed to log usage for ${feature}:`, error.message);
  }
};
