import express from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  createMonitors,
  getProjectMonitors,
  getMonitor,
  checkMonitorNow,
  pauseMonitor,
  resumeMonitor,
  getProjectMonitorSummary
} from '../controllers/monitoring.controller.js';

const router = express.Router();

router.use(requireAuth);

router.post('/projects/:projectId/monitors/create-default', createMonitors);
router.get('/projects/:projectId/monitors', getProjectMonitors);
router.get('/projects/:projectId/monitor-summary', getProjectMonitorSummary);

router.get('/monitors/:monitorId', getMonitor);
router.post('/monitors/:monitorId/check-now', checkMonitorNow);
router.patch('/monitors/:monitorId/pause', pauseMonitor);
router.patch('/monitors/:monitorId/resume', resumeMonitor);

export default router;
