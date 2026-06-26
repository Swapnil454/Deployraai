import express from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  getAlertHistory
} from '../controllers/alert.controller.js';

const router = express.Router();

router.use(requireAuth);

// Routes nested under a project, requiring team access
router.get('/:projectId/rules', getAlertRules);
router.post('/:projectId/rules', createAlertRule);
router.put('/:projectId/rules/:ruleId', updateAlertRule);
router.delete('/:projectId/rules/:ruleId', deleteAlertRule);

router.get('/:projectId/history', getAlertHistory);

export default router;
