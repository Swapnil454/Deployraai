import express from 'express';
import { requireAuth, verifyProjectOwnership } from '../middleware/auth.middleware.js';
import {
  getStatusPageConfig,
  updateStatusPageConfig,
  getSLOs,
  createSLO,
  deleteSLO,
  getSLOStatus
} from '../controllers/slo.controller.js';

const router = express.Router();

router.use(requireAuth);

// Status Page Config
router.get('/:projectId/status-page', verifyProjectOwnership, getStatusPageConfig);
router.patch('/:projectId/status-page', verifyProjectOwnership, updateStatusPageConfig);

// SLOs
router.get('/:projectId/slos', verifyProjectOwnership, getSLOs);
router.post('/:projectId/slos', verifyProjectOwnership, createSLO);
router.get('/:projectId/slos/:sloId/status', verifyProjectOwnership, getSLOStatus);
router.delete('/:projectId/slos/:sloId', verifyProjectOwnership, deleteSLO);

export default router;
