import express from "express";
import { 
  triggerFrontendDeployment,
  triggerBackendDeployment,
  triggerFullDeployment,
  getDeployment,
  syncDeployment,
  explainDeploymentError,
  retryDeployment,
  getUserDeployments,
  deleteDeployment,
  rollbackDeployment
} from "../controllers/deployment.controller.js";
import { applyConfigFix } from "../controllers/configFix.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.post("/:projectId/frontend", triggerFrontendDeployment);
router.post("/:projectId/backend", triggerBackendDeployment);
router.post("/:projectId/full", triggerFullDeployment);

router.get("/", getUserDeployments);
router.get("/:deploymentId", getDeployment);
router.post("/:deploymentId/sync", syncDeployment);
router.post("/:deploymentId/explain-error", explainDeploymentError);
router.post("/:deploymentId/retry", retryDeployment);
router.post("/:deploymentId/rollback", rollbackDeployment);
router.delete("/:deploymentId", deleteDeployment);
router.post("/:deploymentId/apply-config-fix", applyConfigFix);

// Auto-Fix PR route
import { createFixPr } from "../controllers/fixPr.controller.js";
router.post("/:deploymentId/create-fix-pr", createFixPr);

export default router;
