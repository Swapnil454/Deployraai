import express from 'express';
import { 
  getIntegrationStatus,
  connectProvider,
  callbackProvider,
  disconnectProvider,
  connectApiKey,
  getCloudflareZones
} from '../controllers/integration.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(requireAuth);

router.get('/status', getIntegrationStatus);

router.get('/cloudflare/zones', getCloudflareZones);

// API Key specific (Render, Railway)
router.post('/:provider/connect-api-key', connectApiKey);
router.post('/render/disconnect', disconnectProvider);

// Generic OAuth routes for vercel, netlify, railway
router.get('/:provider/connect', connectProvider);
router.get('/:provider/callback', callbackProvider);
router.post('/:provider/disconnect', disconnectProvider);

export default router;
