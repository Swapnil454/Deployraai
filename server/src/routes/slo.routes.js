import express from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
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
router.get('/:projectId/status-page', getStatusPageConfig);
router.patch('/:projectId/status-page', updateStatusPageConfig);

// SLOs
router.get('/:projectId/slos', getSLOs);
router.post('/:projectId/slos', createSLO);
router.get('/:projectId/slos/:sloId/status', getSLOStatus);
router.delete('/:projectId/slos/:sloId', deleteSLO);

export default router;
