import Monitor from '../models/Monitor.js';
import MonitorCheck from '../models/MonitorCheck.js';
import Project from '../models/Project.js';
import { createDefaultMonitors, runMonitorCheck } from '../services/monitoring.service.js';

export const createMonitors = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ _id: projectId, userId: req.user.userId });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const result = await createDefaultMonitors(projectId);
    res.json({ success: true, result });
  } catch (error) {
    console.error("Create monitors error:", error);
    res.status(500).json({ error: "Failed to create monitors" });
  }
};

export const getProjectMonitors = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ _id: projectId, userId: req.user.userId });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const monitors = await Monitor.find({ projectId }).sort({ type: -1 });
    res.json({ success: true, monitors });
  } catch (error) {
    console.error("Get monitors error:", error);
    res.status(500).json({ error: "Failed to get monitors" });
  }
};

export const getMonitor = async (req, res) => {
  try {
    const { monitorId } = req.params;
    const monitor = await Monitor.findOne({ _id: monitorId, userId: req.user.userId });
    if (!monitor) return res.status(404).json({ error: "Monitor not found" });

    const checks = await MonitorCheck.find({ monitorId }).sort({ checkedAt: -1 }).limit(50);
    res.json({ success: true, monitor, checks });
  } catch (error) {
    console.error("Get monitor error:", error);
    res.status(500).json({ error: "Failed to get monitor" });
  }
};

export const checkMonitorNow = async (req, res) => {
  try {
    const { monitorId } = req.params;
    const monitor = await Monitor.findOne({ _id: monitorId, userId: req.user.userId });
    if (!monitor) return res.status(404).json({ error: "Monitor not found" });

    const updatedMonitor = await runMonitorCheck(monitorId);
    res.json({ success: true, monitor: updatedMonitor });
  } catch (error) {
    console.error("Check monitor error:", error);
    res.status(500).json({ error: "Failed to check monitor" });
  }
};

export const pauseMonitor = async (req, res) => {
  try {
    const { monitorId } = req.params;
    const monitor = await Monitor.findOneAndUpdate(
      { _id: monitorId, userId: req.user.userId },
      { isEnabled: false, status: 'paused' },
      { returnDocument: 'after' }
    );
    if (!monitor) return res.status(404).json({ error: "Monitor not found" });
    res.json({ success: true, monitor });
  } catch (error) {
    console.error("Pause monitor error:", error);
    res.status(500).json({ error: "Failed to pause monitor" });
  }
};

export const resumeMonitor = async (req, res) => {
  try {
    const { monitorId } = req.params;
    const monitor = await Monitor.findOneAndUpdate(
      { _id: monitorId, userId: req.user.userId },
      { isEnabled: true, status: 'unknown' },
      { returnDocument: 'after' }
    );
    if (!monitor) return res.status(404).json({ error: "Monitor not found" });
    res.json({ success: true, monitor });
  } catch (error) {
    console.error("Resume monitor error:", error);
    res.status(500).json({ error: "Failed to resume monitor" });
  }
};

export const getProjectMonitorSummary = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ _id: projectId, userId: req.user.userId });
    if (!project) return res.status(404).json({ error: "Project not found" });

    let monitors = await Monitor.find({ projectId });
    
    // Auto-create monitors if they don't exist for this project
    if (monitors.length === 0) {
      const { createDefaultMonitors } = await import('../services/monitoring.service.js');
      try {
        await createDefaultMonitors(projectId);
        monitors = await Monitor.find({ projectId });
      } catch (err) {
        console.error("Failed to auto-create monitors in summary:", err);
      }
    }

    const summary = {
      frontendUptime: 0,
      backendUptime: 0,
      recentChecks: [],
    };

    const frontend = monitors.find(m => m.type === 'frontend');
    const backend = monitors.find(m => m.type === 'backend');

    if (frontend) summary.frontendUptime = frontend.uptimePercentage;
    if (backend) summary.backendUptime = backend.uptimePercentage;

    const monitorIds = monitors.map(m => m._id);
    summary.recentChecks = await MonitorCheck.find({ monitorId: { $in: monitorIds } })
      .sort({ checkedAt: -1 })
      .limit(20)
      .populate('monitorId', 'name type');

    res.json({ success: true, summary });
  } catch (error) {
    console.error("Get monitor summary error:", error);
    res.status(500).json({ error: "Failed to get monitor summary" });
  }
};

export const getMonitorHistory = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { timeRange = '1d' } = req.query;
    
    const project = await Project.findOne({ _id: projectId, userId: req.user.userId });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const monitors = await Monitor.find({ projectId });
    if (monitors.length === 0) return res.json({ success: true, history: { frontend: [], backend: [] } });

    let days = 1;
    if (timeRange === '7d') days = 7;
    else if (timeRange === '15d') days = 15;
    else if (timeRange === '1m') days = 30;
    else if (timeRange === '1y') days = 365;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const monitorIds = monitors.map(m => m._id);
    
    const checks = await MonitorCheck.find({
      monitorId: { $in: monitorIds },
      checkedAt: { $gte: startDate }
    })
    .sort({ checkedAt: 1 })
    .populate('monitorId', 'name type')
    .lean();

    const history = {
      frontend: [],
      backend: []
    };

    checks.forEach(c => {
      const type = c.monitorId?.type;
      if (type === 'frontend') history.frontend.push(c);
      else if (type === 'backend') history.backend.push(c);
    });

    // Sample data to prevent massive payloads for 1y
    const downsample = (arr, maxItems = 100) => {
      if (arr.length <= maxItems) return arr;
      const step = Math.ceil(arr.length / maxItems);
      return arr.filter((_, i) => i % step === 0);
    };

    history.frontend = downsample(history.frontend);
    history.backend = downsample(history.backend);

    res.json({ success: true, history });
  } catch (error) {
    console.error("Get monitor history error:", error);
    res.status(500).json({ error: "Failed to get monitor history" });
  }
};
