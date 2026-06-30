import express from 'express';
import axios from 'axios';
import { requireAuth, verifyProjectOwnership } from '../middleware/auth.middleware.js';
import Project from '../models/Project.js';

const router = express.Router();
const ANALYTICS_API_URL = process.env.ANALYTICS_API_URL || 'http://localhost:4318';

// Apply auth middleware to all routes
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
