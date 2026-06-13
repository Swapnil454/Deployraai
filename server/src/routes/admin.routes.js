import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';
import {
  getOverviewMetrics,
  getUsers,
  getDeployments,
  getBugReports,
  updateBugReportStatus,
  getMonitors,
  getProvidersSummary
} from '../controllers/admin.controller.js';

const router = express.Router();

// Apply auth and admin checks to all admin routes
router.use(requireAuth);
router.use(requireAdmin);

router.get('/overview', getOverviewMetrics);
router.get('/users', getUsers);
router.get('/deployments', getDeployments);
router.get('/bug-reports', getBugReports);
router.patch('/bug-reports/:id/status', updateBugReportStatus);
router.get('/monitors', getMonitors);
router.get('/providers/summary', getProvidersSummary);

export default router;
