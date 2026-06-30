import User from '../models/User.js';
import Project from '../models/Project.js';
import Deployment from '../models/Deployment.js';
import DomainSetup from '../models/DomainSetup.js';
import Monitor from '../models/Monitor.js';
import MonitorCheck from '../models/MonitorCheck.js';
import PlatformBugReport from '../models/PlatformBugReport.js';

export const getOverviewMetrics = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalProjects = await Project.countDocuments();
    const totalDeployments = await Deployment.countDocuments();
    const successfulDeployments = await Deployment.countDocuments({ status: { $in: ['success', 'completed'] } });
    const failedDeployments = await Deployment.countDocuments({ status: 'failed' });
    const activeDomains = await DomainSetup.countDocuments({ status: 'active' });
    const activeMonitors = await Monitor.countDocuments({ status: { $in: ['online', 'degraded'] } });
    const offlineMonitors = await Monitor.countDocuments({ status: 'offline' });
    const openBugReports = await PlatformBugReport.countDocuments({ status: { $ne: 'fixed' } });

    res.json({
      success: true,
      metrics: {
        totalUsers,
        totalProjects,
        totalDeployments,
        successfulDeployments,
        failedDeployments,
        successRate: totalDeployments > 0 ? Math.round((successfulDeployments / totalDeployments) * 100) : 0,
        activeDomains,
        activeMonitors,
        offlineMonitors,
        openBugReports
      }
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    res.status(500).json({ error: "Failed to fetch overview metrics" });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

export const getDeployments = async (req, res) => {
  try {
    const { status, platform, type } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (platform) filter.platform = platform;
    if (type) filter.type = type;

    const deployments = await Deployment.find(filter)
      .populate('projectId', 'name')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, deployments });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch deployments" });
  }
};

export const getBugReports = async (req, res) => {
  try {
    const bugReports = await PlatformBugReport.find({})
      .select('-sanitizedLogs -stackTraceSanitized')
      .populate('projectId', 'name')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, bugReports });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bug reports" });
  }
};

export const updateBugReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const bugReport = await PlatformBugReport.findByIdAndUpdate(id, { status }, { returnDocument: 'after' });
    res.json({ success: true, bugReport });
  } catch (error) {
    res.status(500).json({ error: "Failed to update bug report" });
  }
};

export const getMonitors = async (req, res) => {
  try {
    const monitors = await Monitor.find({})
      .populate('projectId', 'name')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, monitors });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch monitors" });
  }
};

export const getProvidersSummary = async (req, res) => {
  try {
    const failedCounts = await Deployment.aggregate([
      { $match: { status: 'failed' } },
      { $group: { _id: "$platform", count: { $sum: 1 } } }
    ]);

    const providers = {
      vercel: 0,
      render: 0,
      railway: 0,
      netlify: 0,
      github: 0,
      cloudflare: 0
    };

    failedCounts.forEach(stat => {
      if (stat._id && providers[stat._id] !== undefined) {
        providers[stat._id] = stat.count;
      }
    });

    res.json({ success: true, failures: providers });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch providers summary" });
  }
};
