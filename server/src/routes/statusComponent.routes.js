import express from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  getComponents,
  createComponent,
  updateComponent,
  deleteComponent
} from '../controllers/statusComponent.controller.js';

const router = express.Router();

router.use(requireAuth);

router.get('/:projectId/status-components', getComponents);
router.post('/:projectId/status-components', createComponent);
router.patch('/:projectId/status-components/:componentId', updateComponent);
router.delete('/:projectId/status-components/:componentId', deleteComponent);

export default router;
