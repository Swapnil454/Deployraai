import express from 'express';
import axios from 'axios';
import { requireAuth } from '../middleware/auth.middleware.js';
import Project from '../models/Project.js';

const router = express.Router();
const ANALYTICS_API_URL = process.env.ANALYTICS_API_URL || 'http://localhost:4318';

// Apply auth middleware to all routes
router.use(requireAuth);

// Middleware to verify user owns the project
const verifyProjectOwnership = async (req, res, next) => {
  try {
    const projectId = req.query.projectId;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId query parameter is required' });
    }

    const project = await Project.findOne({ _id: projectId, userId: req.user.userId });
    if (!project) {
      return res.status(403).json({ error: 'Access denied: You do not own this project' });
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify project ownership' });
  }
};

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
      responseType: req.path.includes('stream') ? 'stream' : 'json',
      timeout: 30000, // 30s — prevent hanging if analytics-api is slow
    });

    // If it's a stream (like SSE for logs), pipe it back
    if (req.path.includes('stream') || response.headers['content-type']?.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      return response.data.pipe(res);
    }

    // Otherwise send standard JSON response
    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      console.error('Analytics API Proxy Error:', error.message);
      res.status(502).json({ error: 'Bad Gateway: Analytics API is unreachable' });
    }
  }
});

export default router;
