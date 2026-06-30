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
router.use(verifyProjectOwnership);

router.get('/:projectId/incidents', getIncidents);
router.post('/:projectId/incidents', createIncident);
router.get('/:projectId/incidents/:incidentId', getIncidentById);
router.patch('/:projectId/incidents/:incidentId/status', updateIncidentStatus);
router.get('/:projectId/incidents/:incidentId/updates', getIncidentUpdates);

export default router;
