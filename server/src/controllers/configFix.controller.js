import Deployment from "../models/Deployment.js";
import Project from "../models/Project.js";
import ConfigFixHistory from "../models/ConfigFixHistory.js";

const ALLOWED_FIELDS = [
  "configuration.frontendRoot",
  "configuration.backendRoot",
  "configuration.frontendBuildCommand",
  "configuration.backendBuildCommand",
  "configuration.backendStartCommand",
  "configuration.installCommand",
  "configuration.outputDirectory",
  "configuration.frontendPlatform",
  "configuration.backendPlatform"
];

export const applyConfigFix = async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const userId = req.user.userId;

    const deployment = await Deployment.findById(deploymentId);
    if (!deployment) return res.status(404).json({ error: "Deployment not found" });
    if (deployment.userId.toString() !== userId.toString()) return res.status(403).json({ error: "Access denied" });

    if (!deployment.aiAnalysis || deployment.aiAnalysis.userAction !== 'update_config') {
      return res.status(400).json({ error: "This deployment does not have an actionable configuration fix." });
    }

    const suggestion = deployment.aiAnalysis.configFixSuggestion;
    if (!suggestion || !suggestion.fieldPath) {
      return res.status(400).json({ error: "No valid configuration fix suggestion found." });
    }

    // We do NOT auto-apply env variables directly through this API to prevent AI hallucinating secrets.
    if (suggestion.fieldPath.includes("envVariables")) {
      return res.status(400).json({ error: "Environment variables must be manually updated via the dashboard UI for security." });
    }

    if (!ALLOWED_FIELDS.includes(suggestion.fieldPath)) {
      return res.status(403).json({ error: `Updating field ${suggestion.fieldPath} automatically is not allowed.` });
    }

    const project = await Project.findById(deployment.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    // fieldPath is e.g., "configuration.backendStartCommand"
    const pathParts = suggestion.fieldPath.split('.');
    if (pathParts[0] !== 'configuration' || pathParts.length !== 2) {
      return res.status(400).json({ error: "Invalid field path structure." });
    }
    
    const configKey = pathParts[1];
    const previousValue = project.configuration[configKey];
    
    // Apply update
    project.configuration[configKey] = suggestion.suggestedValue;
    await project.save();

    // Create Audit Log
    await ConfigFixHistory.create({
      userId,
      projectId: project._id,
      deploymentId: deployment._id,
      fieldPath: suggestion.fieldPath,
      previousValue,
      newValue: suggestion.suggestedValue,
      reason: suggestion.reason
    });

    res.json({ success: true, project });
  } catch (error) {
    console.error("Apply config fix error:", error);
    res.status(500).json({ error: "Failed to apply configuration fix" });
  }
};
