import express from "express";
import { analyzeProject, createProject, getProjects, getProject, updateProjectConfig } from "../controllers/project.controller.js";
import { getProjectDeployments } from "../controllers/deployment.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.post("/analyze", analyzeProject);

// Phase 3 Endpoints
router.post("/", createProject);
router.get("/", getProjects);
router.get("/:id", getProject);
router.put("/:id/config", updateProjectConfig);
router.get("/:projectId/deployments", getProjectDeployments);

export default router;
