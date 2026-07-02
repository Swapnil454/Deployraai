import express from "express";
import { analyzeProject, createProject, getProjects, getProject, updateProjectConfig, enableAnalytics, disableAnalytics, getAnalyticsSummary, getProjectUsage, getAiUsage } from "../controllers/project.controller.js";
import { autoInjectAnalytics, verifyAnalytics } from "../controllers/analytics.controller.js";
import { getProjectDeployments } from "../controllers/deployment.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.post("/analyze", analyzeProject);

import { listProjectFixPrs } from "../controllers/fixPr.controller.js";

// Phase 3 Endpoints
router.post("/", createProject);
router.get("/", getProjects);
router.get("/usage/ai", getAiUsage);
router.get("/:id", getProject);
router.put("/:id/config", updateProjectConfig);
router.get("/:projectId/deployments", getProjectDeployments);
router.get("/:projectId/fix-prs", listProjectFixPrs);
router.get("/:projectId/analytics/summary", getAnalyticsSummary);
router.get("/:id/usage", getProjectUsage);
router.post("/:projectId/analytics/enable", enableAnalytics);
router.post("/:projectId/analytics/disable", disableAnalytics);
router.post("/:projectId/analytics/auto-inject", autoInjectAnalytics);
router.post("/:projectId/analytics/verify", verifyAnalytics);

export default router;
