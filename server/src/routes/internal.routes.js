import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Project from '../models/Project.js';
import User from '../models/User.js';
import { 
  sendDeploymentSuccess, 
  sendDeploymentFailed, 
  sendPRCreated, 
  sendIssueArrived 
} from '../services/notification.service.js';

const router = express.Router();

// Memory-based rate limiter to prevent email bombing (e.g. from public telemetry spam)
const emailRateLimits = new Map();

// Helper to check rate limit: max 5 emails per hour per project per event
const checkRateLimit = (projectId, event) => {
  const key = `${projectId}:${event}`;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  
  const record = emailRateLimits.get(key) || { count: 0, resetAt: now + windowMs };
  
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + windowMs;
  } else {
    record.count += 1;
  }
  
  emailRateLimits.set(key, record);
  return record.count <= 5;
};

// Middleware to enforce internal secret
const requireInternalSecret = (req, res, next) => {
  const secret = req.headers['x-internal-secret'];
  const envSecret = process.env.INTERNAL_API_SECRET;
  
  if (!secret || !envSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const secretBuffer = Buffer.from(secret);
    const envSecretBuffer = Buffer.from(envSecret);
    
    if (secretBuffer.length !== envSecretBuffer.length || !crypto.timingSafeEqual(secretBuffer, envSecretBuffer)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

router.post('/notify', requireInternalSecret, async (req, res) => {
  const { event, projectId, data } = req.body;

  if (!event || !projectId) {
    return res.status(400).json({ error: 'Missing required fields: event, projectId' });
  }

  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    return res.status(400).json({ error: 'Invalid projectId format' });
  }

  const allowedEvents = ['deployment_success', 'deployment_failed', 'pr_created', 'issue_arrived'];
  if (!allowedEvents.includes(event)) {
    return res.status(400).json({ error: `Invalid event type. Allowed: ${allowedEvents.join(', ')}` });
  }

  try {
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const user = await User.findById(project.userId);
    if (!user) {
      return res.status(404).json({ error: 'Project owner not found' });
    }

    // Check preferences
    if (user.notificationPreferences?.emailEnabled === false) {
      return res.status(200).json({ message: 'User disabled email notifications' });
    }

    // Apply rate limiting (e.g. max 5 emails per hour for issues)
    if (!checkRateLimit(projectId, event)) {
      console.warn(`[Internal API] Rate limit exceeded for ${event} on project ${projectId}. Suppressing email.`);
      return res.status(200).json({ message: 'Rate limit exceeded, email suppressed' });
    }

    switch (event) {
      case 'deployment_success':
        await sendDeploymentSuccess(user.email, project, data?.url);
        break;
      case 'deployment_failed':
        await sendDeploymentFailed(user.email, project, data?.errorMessage);
        break;
      case 'pr_created':
        await sendPRCreated(user.email, project, data?.prUrl, data?.exceptionType);
        break;
      case 'issue_arrived':
        await sendIssueArrived(user.email, project, data?.issueTitle, data?.severity);
        break;
    }

    return res.status(200).json({ message: 'Notification dispatched' });
  } catch (error) {
    console.error('[Internal API] Error processing notification:', error);
    // Return 200 anyway so we don't crash callers on internal DB errors
    return res.status(200).json({ message: 'Failed to process notification internally' });
  }
});

router.get('/projects/:projectId/log-pipelines', requireInternalSecret, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    // Return only active pipelines
    const pipelines = (project.logPipelines || []).filter(p => p.active);
    res.json(pipelines);
  } catch (err) {
    console.error('[Internal API] Error fetching log pipelines:', err);
    res.status(500).json({ error: 'Failed to fetch log pipelines' });
  }
});

export default router;
