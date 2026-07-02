import express from 'express';
import { requireAuth, verifyProjectOwnership } from '../middleware/auth.middleware.js';
import {
  getIncidents,
  getIncidentById,
  createIncident,
  updateIncidentStatus,
  getIncidentUpdates
} from '../controllers/incident.controller.js';

const router = express.Router();

router.use(requireAuth);

router.get('/:projectId/incidents', verifyProjectOwnership, getIncidents);
router.post('/:projectId/incidents', verifyProjectOwnership, createIncident);
router.get('/:projectId/incidents/:incidentId', verifyProjectOwnership, getIncidentById);
router.patch('/:projectId/incidents/:incidentId/status', verifyProjectOwnership, updateIncidentStatus);
router.get('/:projectId/incidents/:incidentId/updates', verifyProjectOwnership, getIncidentUpdates);

export default router;
