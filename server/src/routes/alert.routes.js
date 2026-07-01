import express from 'express';
import { requireAuth, verifyProjectOwnership } from '../middleware/auth.middleware.js';
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
router.get('/:projectId/rules', verifyProjectOwnership, getAlertRules);
router.post('/:projectId/rules', verifyProjectOwnership, createAlertRule);
router.put('/:projectId/rules/:ruleId', verifyProjectOwnership, updateAlertRule);
router.delete('/:projectId/rules/:ruleId', verifyProjectOwnership, deleteAlertRule);

router.get('/:projectId/history', verifyProjectOwnership, getAlertHistory);

export default router;
