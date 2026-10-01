import Monitor from '../models/Monitor.js';
import MonitorCheck from '../models/MonitorCheck.js';
import Project from '../models/Project.js';
import { createDefaultMonitors, runMonitorCheck } from '../services/monitoring.service.js';

const MONITOR_TIME_RANGES = {
  '1h': { hours: 1, label: 'Last 1 Hour' },
  '6h': { hours: 6, label: 'Last 6 Hours' },
  '12h': { hours: 12, label: 'Last 12 Hours' },
  '24h': { hours: 24, label: 'Last 24 Hours' },
  '7d': { hours: 7 * 24, label: 'Last 7 Days' },
  '15d': { hours: 15 * 24, label: 'Last 15 Days' },
  '30d': { hours: 30 * 24, label: 'Last 30 Days' }
};

const getMonitorRange = (timeRange) => {
  const range = MONITOR_TIME_RANGES[timeRange] || MONITOR_TIME_RANGES['24h'];
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setHours(startDate.getHours() - range.hours);
  return { ...range, startDate, endDate };
};

const toServiceSummary = (stats = {}) => {
  const totalChecks = stats.totalChecks || 0;
  const onlineChecks = stats.onlineChecks || 0;
  const degradedChecks = stats.degradedChecks || 0;
  const offlineChecks = stats.offlineChecks || 0;
  const availableChecks = onlineChecks + degradedChecks;

  return {
    totalChecks,
    onlineChecks,
    degradedChecks,
    offlineChecks,
    // Availability treats degraded responses as available. Healthy is strictly 2xx/3xx and fast.
    uptimePercentage: totalChecks ? (availableChecks / totalChecks) * 100 : 0,
    healthyPercentage: totalChecks ? (onlineChecks / totalChecks) * 100 : 0,
    averageResponseTimeMs: stats.averageResponseTimeMs ? Math.round(stats.averageResponseTimeMs) : null,
    lastCheckedAt: stats.lastCheckedAt || null
  };
};

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
    const { timeRange = '24h' } = req.query;
    // Keep this bounded: this endpoint powers the monitoring table as well as
    // the overview cards, and must not return a whole retention window at once.
    const requestedPage = Number.parseInt(req.query.page, 10);
    const limit = 20;
    const page = Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1);
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

    const monitorIds = monitors.map(m => m._id);
    const { startDate, endDate, label } = getMonitorRange(timeRange);
    const rangeMatch = { monitorId: { $in: monitorIds }, checkedAt: { $gte: startDate, $lte: endDate } };

    const statsByMonitor = await MonitorCheck.aggregate([
      { $match: rangeMatch },
      {
        $group: {
          _id: '$monitorId',
          totalChecks: { $sum: 1 },
          onlineChecks: { $sum: { $cond: [{ $eq: ['$status', 'online'] }, 1, 0] } },
          degradedChecks: { $sum: { $cond: [{ $eq: ['$status', 'degraded'] }, 1, 0] } },
          offlineChecks: { $sum: { $cond: [{ $eq: ['$status', 'offline'] }, 1, 0] } },
          averageResponseTimeMs: { $avg: '$responseTimeMs' },
          responseTimeSamples: { $sum: { $cond: [{ $ne: ['$responseTimeMs', null] }, 1, 0] } },
          lastCheckedAt: { $max: '$checkedAt' }
        }
      }
    ]);

    const statsForType = (type) => {
      const typeMonitorIds = new Set(monitors.filter(m => m.type === type).map(m => m._id.toString()));
      const aggregate = statsByMonitor
        .filter(stat => typeMonitorIds.has(stat._id.toString()))
        .reduce((total, stat) => ({
          totalChecks: total.totalChecks + stat.totalChecks,
          onlineChecks: total.onlineChecks + stat.onlineChecks,
          degradedChecks: total.degradedChecks + stat.degradedChecks,
          offlineChecks: total.offlineChecks + stat.offlineChecks,
          responseTimeTotal: total.responseTimeTotal + ((stat.averageResponseTimeMs || 0) * (stat.responseTimeSamples || 0)),
          responseTimeSamples: total.responseTimeSamples + (stat.responseTimeSamples || 0),
          lastCheckedAt: !total.lastCheckedAt || stat.lastCheckedAt > total.lastCheckedAt ? stat.lastCheckedAt : total.lastCheckedAt
        }), { totalChecks: 0, onlineChecks: 0, degradedChecks: 0, offlineChecks: 0, responseTimeTotal: 0, responseTimeSamples: 0, lastCheckedAt: null });

      return toServiceSummary({
        ...aggregate,
        averageResponseTimeMs: aggregate.responseTimeSamples ? aggregate.responseTimeTotal / aggregate.responseTimeSamples : null
      });
    };

    const totalChecks = await MonitorCheck.countDocuments(rangeMatch);
    const totalPages = Math.max(Math.ceil(totalChecks / limit), 1);
    const currentPage = Math.min(page, totalPages);
    const recentChecks = await MonitorCheck.find(rangeMatch)
      .sort({ checkedAt: -1 })
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .populate('monitorId', 'name type')
      .lean();

    const frontend = statsForType('frontend');
    const backend = statsForType('backend');
    const summary = {
      timeRange,
      rangeLabel: label,
      startDate,
      endDate,
      frontend,
      backend,
      // Kept for compatibility with existing dashboard consumers.
      frontendUptime: frontend.uptimePercentage,
      backendUptime: backend.uptimePercentage,
      recentChecks,
      pagination: {
        page: currentPage,
        limit,
        totalChecks,
        totalPages,
        hasPreviousPage: currentPage > 1,
        hasNextPage: currentPage < totalPages
      }
    };

    res.json({ success: true, summary });
  } catch (error) {
    console.error("Get monitor summary error:", error);
    res.status(500).json({ error: "Failed to get monitor summary" });
  }
};

export const getMonitorHistory = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { timeRange = '24h' } = req.query;
    
    const project = await Project.findOne({ _id: projectId, userId: req.user.userId });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const monitors = await Monitor.find({ projectId });
    if (monitors.length === 0) return res.json({ success: true, history: { frontend: [], backend: [] } });

    const { startDate, endDate, label } = getMonitorRange(timeRange);

    const monitorIds = monitors.map(m => m._id);
    
    const checks = await MonitorCheck.find({
      monitorId: { $in: monitorIds },
      checkedAt: { $gte: startDate, $lte: endDate }
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

    // Keep chart payloads small while preserving the selected range's full timeline.
    const downsample = (arr, maxItems = 45) => {
      if (arr.length <= maxItems) return arr;
      return Array.from({ length: maxItems }, (_, index) => {
        const sourceIndex = Math.round(index * (arr.length - 1) / (maxItems - 1));
        return arr[sourceIndex];
      });
    };

    history.frontend = downsample(history.frontend);
    history.backend = downsample(history.backend);

    res.json({ success: true, timeRange, rangeLabel: label, startDate, endDate, history });
  } catch (error) {
    console.error("Get monitor history error:", error);
    res.status(500).json({ error: "Failed to get monitor history" });
  }
};
