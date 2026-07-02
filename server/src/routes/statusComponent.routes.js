import express from 'express';
import { requireAuth, verifyProjectOwnership } from '../middleware/auth.middleware.js';
import {
  getComponents,
  createComponent,
  updateComponent,
  deleteComponent
} from '../controllers/statusComponent.controller.js';

const router = express.Router();

router.use(requireAuth);

router.get('/:projectId/status-components', verifyProjectOwnership, getComponents);
router.post('/:projectId/status-components', verifyProjectOwnership, createComponent);
router.patch('/:projectId/status-components/:componentId', verifyProjectOwnership, updateComponent);
router.delete('/:projectId/status-components/:componentId', verifyProjectOwnership, deleteComponent);

export default router;
