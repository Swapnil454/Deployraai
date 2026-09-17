import express from 'express';
import axios from 'axios';
import { requireAuth, verifyProjectOwnership } from '../middleware/auth.middleware.js';
import Project from '../models/Project.js';

const router = express.Router();
let ANALYTICS_API_URL = process.env.ANALYTICS_API_URL || 'http://localhost:4318';
let INGESTOR_URL = process.env.INGESTOR_URL || 'http://localhost:4317';

// If deployed on Render and they mistakenly pointed the URLs to the main Express app, force localhost since we now auto-spawn them.
if (ANALYTICS_API_URL.includes(process.env.RENDER_EXTERNAL_URL || 'deployraai.onrender.com')) {
  ANALYTICS_API_URL = 'http://localhost:4318';
}
if (INGESTOR_URL.includes(process.env.RENDER_EXTERNAL_URL || 'deployraai.onrender.com')) {
  INGESTOR_URL = 'http://localhost:4317';
}

// Unauthenticated Trace Ingestion Endpoint
// The tracepilot SDK sends POST to /api/observability/traces/v1/traces
router.post('/traces/v1/traces', async (req, res) => {
  try {
    console.log("Observability Proxy received headers:", req.headers);
    let authHeader = req.headers.authorization || '';
    
    // Fallback to x-tracepilot-project-id for frontend React SDK
    if (!authHeader && req.headers['x-tracepilot-project-id']) {
      authHeader = `Bearer ${req.headers['x-tracepilot-project-id']}`;
    }
    
    // If tracepilot sends the service name, resolve it to the project's JWT token
    if (authHeader.startsWith('Bearer ')) {
      const possibleName = authHeader.replace('Bearer ', '').trim();
      const project = await Project.findOne({ repoName: possibleName });
      if (project?.analytics?.trackingId) {
        authHeader = `Bearer ${project.analytics.trackingId}`;
      }
    }

    const targetUrl = `${INGESTOR_URL}/v1/traces`;
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    });
    res.status(response.status).send(response.data);
  } catch (error) {
    console.error('Ingestion API Error:', error.message);
    res.status(error.response?.status || 502).json(error.response?.data || { error: 'Ingestion failed' });
  }
});

// Unauthenticated RUM Ingestion Endpoint
router.post('/rum/v1/rum', async (req, res) => {
  try {
    let authHeader = req.headers.authorization || '';
    
    // If tracepilot sends the service name, resolve it to the project's JWT token
    if (authHeader.startsWith('Bearer ')) {
      const possibleName = authHeader.replace('Bearer ', '').trim();
      const project = await Project.findOne({ repoName: possibleName });
      if (project?.analytics?.trackingId) {
        authHeader = `Bearer ${project.analytics.trackingId}`;
      }
    }

    const targetUrl = `${INGESTOR_URL}/v1/rum`;
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    });
    res.status(response.status).send(response.data);
  } catch (error) {
    console.error('RUM Ingestion API Error:', error.message);
    res.status(error.response?.status || 502).json(error.response?.data || { error: 'RUM Ingestion failed' });
  }
});

// Apply auth middleware to all OTHER routes (dashboard fetch)
router.use(requireAuth);

// Catch-all proxy route
router.use('/', verifyProjectOwnership, async (req, res) => {
  try {
    const targetUrl = `${ANALYTICS_API_URL}${req.path}`;
    
    // Server auth uses HTTP-only cookies, but analytics-api expects Authorization: Bearer <token>.
    // Re-package the verified cookie JWT as a Bearer header for the internal service call.
    const cookieName = process.env.COOKIE_NAME || 'deployai_token';
    const cookieToken = req.cookies?.[cookieName];
    const response = await axios({
      method: req.method,
      url: targetUrl,
      params: req.query,
      data: req.body,
      headers: {
        Authorization: cookieToken ? `Bearer ${cookieToken}` : (req.headers.authorization || ''),
      },
      responseType: 'stream',
      timeout: 30000, // 30s — prevent hanging if analytics-api is slow
    });

    // Pass through status and headers
    res.status(response.status);
    for (const [key, value] of Object.entries(response.headers)) {
      // Don't set transfer-encoding chunked manually as Node handles it
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    }

    // Pipe the binary stream directly back to the client to avoid holding JSON in memory
    response.data.pipe(res);
  } catch (error) {
    if (error.response && error.response.data && typeof error.response.data.pipe === 'function') {
      res.status(error.response.status);
      error.response.data.pipe(res);
    } else {
      console.error('Analytics API Proxy Error:', error.message);
      res.status(502).json({ error: 'Bad Gateway: Analytics API is unreachable' });
    }
  }
});

export default router;
