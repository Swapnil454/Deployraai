import express from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import Monitor from '../models/Monitor.js';
import MonitorCheck from '../models/MonitorCheck.js';
import Project from '../models/Project.js';
import { createDefaultMonitors, runMonitorCheck, getMonitorSummary } from '../services/monitoring.service.js';

const router = express.Router();
router.use(requireAuth);

// Create default monitors for a project
router.post('/projects/:projectId/monitors/create-default', async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, userId: req.user.userId });
    if (!project) return res.status(404).json({ error: "Project not found" });

    await createDefaultMonitors(project._id);
    const monitors = await Monitor.find({ projectId: project._id });
    res.json({ success: true, monitors });
  } catch (error) {
    console.error("Create default monitors error:", error);
    res.status(500).json({ error: "Failed to create default monitors" });
  }
});

// Get all monitors for a project
router.get('/projects/:projectId/monitors', async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, userId: req.user.userId });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const monitors = await Monitor.find({ projectId: project._id });
    res.json({ success: true, monitors });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch monitors" });
  }
});

// Get monitor summary
router.get('/projects/:projectId/monitor-summary', async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, userId: req.user.userId });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const monitors = await getMonitorSummary(project._id);
    res.json({ success: true, monitors });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch monitor summary" });
  }
});

// Get single monitor with recent checks
router.get('/monitors/:monitorId', async (req, res) => {
  try {
    const monitor = await Monitor.findOne({ _id: req.params.monitorId, userId: req.user.userId });
    if (!monitor) return res.status(404).json({ error: "Monitor not found" });

    const checks = await MonitorCheck.find({ monitorId: monitor._id }).sort({ checkedAt: -1 }).limit(100);
    res.json({ success: true, monitor, checks });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch monitor details" });
  }
});

// Run manual check
router.post('/monitors/:monitorId/check-now', async (req, res) => {
  try {
    let monitor = await Monitor.findOne({ _id: req.params.monitorId, userId: req.user.userId });
    if (!monitor) return res.status(404).json({ error: "Monitor not found" });

    monitor = await runMonitorCheck(monitor._id);
    res.json({ success: true, monitor });
  } catch (error) {
    res.status(500).json({ error: "Failed to run monitor check" });
  }
});

// Pause monitor
router.patch('/monitors/:monitorId/pause', async (req, res) => {
  try {
    const monitor = await Monitor.findOneAndUpdate(
      { _id: req.params.monitorId, userId: req.user.userId },
      { isEnabled: false, status: 'paused' },
      { new: true }
    );
    if (!monitor) return res.status(404).json({ error: "Monitor not found" });
    res.json({ success: true, monitor });
  } catch (error) {
    res.status(500).json({ error: "Failed to pause monitor" });
  }
});

// Resume monitor
router.patch('/monitors/:monitorId/resume', async (req, res) => {
  try {
    const monitor = await Monitor.findOneAndUpdate(
      { _id: req.params.monitorId, userId: req.user.userId },
      { isEnabled: true, status: 'pending' },
      { new: true }
    );
    if (!monitor) return res.status(404).json({ error: "Monitor not found" });
    res.json({ success: true, monitor });
  } catch (error) {
    res.status(500).json({ error: "Failed to resume monitor" });
  }
});

export default router;
