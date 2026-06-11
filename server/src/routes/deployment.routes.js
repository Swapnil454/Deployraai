import express from "express";
import { 
  triggerFrontendDeployment,
  triggerBackendDeployment,
  triggerFullDeployment,
  getDeployment,
  syncDeployment
} from "../controllers/deployment.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.post("/:projectId/frontend", triggerFrontendDeployment);
router.post("/:projectId/backend", triggerBackendDeployment);
router.post("/:projectId/full", triggerFullDeployment);

router.get("/:deploymentId", getDeployment);
router.post("/:deploymentId/sync", syncDeployment);

export default router;
