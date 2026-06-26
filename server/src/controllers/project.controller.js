import axios from "axios";
import User from "../models/User.js";
import { decryptSecret } from "../utils/encryption.js";

const getGithubToken = async (userId) => {
  const user = await User.findById(userId);
  if (!user || !user.githubConnected || !user.githubAccessTokenEncrypted) {
    throw new Error("GitHub account not connected or token missing");
  }
  return decryptSecret(user.githubAccessTokenEncrypted);
};

export const analyzeProject = async (req, res) => {
  try {
    const { owner, repo, branch } = req.body;
    if (!owner || !repo || !branch) {
      return res.status(400).json({ error: "Owner, repo, and branch are required" });
    }

    const token = await getGithubToken(req.user.userId);
    
    // 1. Fetch recursive tree
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const treeResponse = await axios.get(treeUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const tree = treeResponse.data.tree;

    // Detect common files
    const packageJsonNode = tree.find(node => node.path === "package.json");
    const clientPackageJsonNode = tree.find(node => node.path.match(/^(client|frontend|web|app)\/package\.json$/));
    const serverPackageJsonNode = tree.find(node => node.path.match(/^(server|backend|api)\/package\.json$/));
    
    // Helper to fetch file content
    const fetchPackageJsonContent = async (path) => {
      if (!path) return null;
      try {
        const contentUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
        const contentRes = await axios.get(contentUrl, {
           headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" }
        });
        const decoded = Buffer.from(contentRes.data.content, "base64").toString("utf-8");
        return JSON.parse(decoded);
      } catch (err) {
        console.error(`Failed to parse ${path}`);
        return null;
      }
    };

    const rootPackage = await fetchPackageJsonContent(packageJsonNode?.path);
    const clientPackage = await fetchPackageJsonContent(clientPackageJsonNode?.path);
    const serverPackage = await fetchPackageJsonContent(serverPackageJsonNode?.path);
    
    // Detect Monorepo
    const isMonorepo = !!(clientPackageJsonNode && serverPackageJsonNode);

    // Analysis structure matches the schema exactly
    const analysis = {
      isMonorepo,
      frontend: { detected: false, framework: null, path: null, packageManager: "npm", buildCommand: null, startCommand: null },
      backend: { detected: false, framework: null, path: null, packageManager: "npm", startCommand: null },
      database: { detected: false, type: null, orm: null },
      warnings: []
    };

    // Helper to scan a package json
    const analyzePackage = (pkg, pathPrefix) => {
      if (!pkg) return;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      // Frontend checks
      if (deps.next) {
        analysis.frontend.detected = true;
        analysis.frontend.framework = "Next.js";
        analysis.frontend.path = pathPrefix || "/";
        analysis.frontend.buildCommand = pkg.scripts?.build || "npm run build";
        analysis.frontend.startCommand = pkg.scripts?.start || "npm start";
      } else if (deps.vite) {
        analysis.frontend.detected = true;
        analysis.frontend.framework = "React Vite";
        analysis.frontend.path = pathPrefix || "/";
        analysis.frontend.buildCommand = pkg.scripts?.build || "npm run build";
        analysis.frontend.startCommand = pkg.scripts?.preview || "npm run preview";
      } else if (deps.react) {
        analysis.frontend.detected = true;
        analysis.frontend.framework = "React CRA";
        analysis.frontend.path = pathPrefix || "/";
      }

      // Backend checks
      if (deps.express) {
        analysis.backend.detected = true;
        analysis.backend.framework = "Express";
        analysis.backend.path = pathPrefix || "/";
        analysis.backend.startCommand = pkg.scripts?.start || "npm start";
      } else if (deps.fastify) {
        analysis.backend.detected = true;
        analysis.backend.framework = "Fastify";
        analysis.backend.path = pathPrefix || "/";
      } else if (deps.nestjs || deps['@nestjs/core']) {
        analysis.backend.detected = true;
        analysis.backend.framework = "NestJS";
        analysis.backend.path = pathPrefix || "/";
      }

      // DB checks
      if (deps.mongoose || deps.mongodb) {
        analysis.database.detected = true;
        analysis.database.type = "MongoDB";
        analysis.database.orm = deps.mongoose ? "Mongoose" : "MongoDB Native";
      } else if (deps['@prisma/client']) {
        analysis.database.detected = true;
        analysis.database.type = "Database (Prisma)";
        analysis.database.orm = "Prisma";
      } else if (deps.pg) {
        analysis.database.detected = true;
        analysis.database.type = "PostgreSQL";
      } else if (deps.mysql2) {
        analysis.database.detected = true;
        analysis.database.type = "MySQL";
      }
    };

    if (isMonorepo) {
      analyzePackage(clientPackage, clientPackageJsonNode.path.split('/')[0]);
      analyzePackage(serverPackage, serverPackageJsonNode.path.split('/')[0]);
    } else {
      analyzePackage(rootPackage, "/");
    }

    const hasDocker = tree.some(n => n.path === "Dockerfile" || n.path.includes("/Dockerfile"));
    const hasVercel = tree.some(n => n.path === "vercel.json");
    const hasRender = tree.some(n => n.path === "render.yaml");

    if (!hasDocker) analysis.warnings.push("No Dockerfile found");
    if (!hasRender && !hasVercel) analysis.warnings.push("No deployment configuration (render.yaml or vercel.json) found");

    res.json({ success: true, analysis });
  } catch (error) {
    console.error("Project Analysis Error:", error.response?.data || error.message);
    if (error.response?.status === 401 || error.message.includes("token missing")) {
      return res.status(401).json({ error: "GitHub connection expired. Please reconnect GitHub." });
    }
    res.status(500).json({ error: "Failed to analyze project" });
  }
};

import Project from "../models/Project.js";
import Deployment from "../models/Deployment.js";
import AiUsage from "../models/AiUsage.js";
import { encryptSecret } from "../utils/encryption.js";

export const createProject = async (req, res) => {
  try {
    const { owner, repo, branch, analysis, fullName, htmlUrl, defaultBranch } = req.body;
    
    if (!owner || !repo || !branch || !analysis) {
      return res.status(400).json({ error: "Missing required project fields" });
    }

    const project = await Project.create({
      userId: req.user.userId,
      repoOwner: owner,
      repoName: repo,
      repoFullName: fullName || `${owner}/${repo}`,
      selectedBranch: branch,
      defaultBranch: defaultBranch || branch,
      repoUrl: htmlUrl,
      analysis,
      status: 'analyzed'
    });

    try {
      const { pool } = await import('../config/postgres.js');
      await pool.query(`
        INSERT INTO alert_rules (project_id, name, event_type, severity, threshold, window_minutes, cooldown_minutes, route_type)
        VALUES ($1, 'Critical frontend errors', 'exception', 'critical', 1, 5, 15, 'dashboard')
      `, [project._id.toString()]);
    } catch (err) {
      console.error("Failed to create default alert rule:", err.message);
    }

    res.status(201).json({ projectId: project._id });
  } catch (error) {
    console.error("Create Project Error:", error.message);
    res.status(500).json({ error: "Failed to create project" });
  }
};

export const getProjects = async (req, res) => {
  try {
    const { search, sortBy, filterBy } = req.query;
    let query = { userId: req.user.userId };
    
    if (search) {
      query.repoName = { $regex: search, $options: 'i' };
    }
    
    if (filterBy === 'Microfrontend') {
      query['analysis.isMonorepo'] = true;
    } else if (filterBy === 'Repository') {
      query['analysis.isMonorepo'] = false;
    }

    let sort = { updatedAt: -1, createdAt: -1 };
    if (sortBy === 'Name') {
      sort = { repoName: 1 };
    }

    const projects = await Project.find(query).sort(sort).lean();

    const Deployment = (await import('../models/Deployment.js')).default;
    const Monitor = (await import('../models/Monitor.js')).default;
    
    for (let project of projects) {
      const latestDeployment = await Deployment.findOne({ 
        projectId: project._id,
        "source.commitMessage": { $exists: true, $ne: null }
      }).sort({ createdAt: -1 }).lean();
      
      if (latestDeployment) {
        project.latestDeployment = latestDeployment;
      }

      const monitors = await Monitor.find({ projectId: project._id }).lean();
      project.monitors = monitors;
    }

    res.json(projects);
  } catch (error) {
    console.error("Get Projects Error:", error.message);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
};

export const getProject = async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user.userId }).lean();
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const Deployment = (await import('../models/Deployment.js')).default;
    const latestDeployment = await Deployment.findOne({ 
      projectId: project._id,
      type: { $in: ['frontend', 'full'] },
      status: { $in: ['success', 'completed'] }
    }).sort({ createdAt: -1 }).lean();
    
    if (latestDeployment) {
      project.latestDeployment = latestDeployment;
    }

    // Decrypt values for the frontend as per user request
    if (project.configuration?.envVariables) {
      const safeEnv = (envs) => envs?.map(env => ({
        key: env.key,
        hasValue: !!env.valueEncrypted,
        value: env.valueEncrypted ? decryptSecret(env.valueEncrypted) : "",
        isSecret: env.isSecret
      })) || [];

      project.configuration.envVariables = {
        frontend: safeEnv(project.configuration.envVariables.frontend),
        backend: safeEnv(project.configuration.envVariables.backend),
        shared: safeEnv(project.configuration.envVariables.shared)
      };
    }

    res.json(project);
  } catch (error) {
    console.error("Get Project Error:", error.message);
    res.status(500).json({ error: "Failed to fetch project" });
  }
};

export const disconnectProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = await Project.findOne({ _id: projectId, userId: req.user.userId });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Clean up Vercel log drain
    if (project.configuration?.vercelLogDrainId && project.configuration?.vercelToken) {
      try {
        await axios.delete(
          `https://api.vercel.com/v1/integrations/log-drains/${project.configuration.vercelLogDrainId}`,
          { headers: { Authorization: `Bearer ${decryptSecret(project.configuration.vercelToken)}` } }
        );
      } catch (err) {
        console.error("Failed to delete Vercel log drain", err.message);
      }
    }

    // Clean up Railway log drain
    if (project.configuration?.railwayLogDrainId && project.configuration?.railwayToken) {
      try {
        await axios.post(
          'https://backboard.railway.app/graphql/v2',
          { query: `mutation { logDrainDelete(id: "${project.configuration.railwayLogDrainId}") }` },
          { headers: { Authorization: `Bearer ${decryptSecret(project.configuration.railwayToken)}` } }
        );
      } catch (err) {
        console.error("Failed to delete Railway log drain", err.message);
      }
    }

    // Stop Render poller
    try {
      // In a real microservice arch, the server would hit the ingestor over HTTP to stop the poller.
      // We will leave this comment as an integration point, but if they are the same process, we'd import it.
      await axios.delete(`${process.env.INGESTOR_URL || 'http://localhost:3002'}/internal/pollers/render/${projectId}`).catch(()=> {});
    } catch(err) {}

    await Project.findByIdAndDelete(projectId);
    res.json({ success: true, message: "Project disconnected and drains cleaned up" });
  } catch (error) {
    console.error("Disconnect Project Error:", error.message);
    res.status(500).json({ error: "Failed to disconnect project" });
  }
};

export const updateProjectConfig = async (req, res) => {
  try {
    const { configuration } = req.body;
    if (!configuration) {
      return res.status(400).json({ error: "Configuration object is required" });
    }

    const project = await Project.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Encrypt env variables
    const processEnvs = (envs, existingEnvs) => {
      if (!envs) return [];
      return envs.map(env => {
        let valEncrypted = undefined;
        if (env.value) {
          valEncrypted = encryptSecret(env.value);
        } else {
          const existing = existingEnvs?.find(e => e.key === env.key);
          if (existing) {
            valEncrypted = existing.valueEncrypted;
          }
        }
        return {
          key: env.key,
          isSecret: env.isSecret ?? true,
          valueEncrypted: valEncrypted
        };
      }).filter(e => e.valueEncrypted !== undefined);
    };

    if (configuration.envVariables) {
      configuration.envVariables = {
        frontend: processEnvs(configuration.envVariables.frontend, project.configuration?.envVariables?.frontend),
        backend: processEnvs(configuration.envVariables.backend, project.configuration?.envVariables?.backend),
        shared: processEnvs(configuration.envVariables.shared, project.configuration?.envVariables?.shared)
      };
    }

    project.configuration = configuration;
    project.status = 'configured';
    
    await project.save();

    res.json({ success: true, message: "Configuration saved successfully" });
  } catch (error) {
    console.error("Update Config Error:", error.message);
    res.status(500).json({ error: "Failed to save configuration" });
  }
};

import crypto from "crypto";
import jwt from "jsonwebtoken";

function generateProjectToken(projectId) {
  if (!process.env.INGESTOR_JWT_SECRET) {
    console.warn("WARNING: INGESTOR_JWT_SECRET not set, falling back to secure random hex");
    return `da_${crypto.randomBytes(16).toString("hex")}`;
  }
  return jwt.sign(
    { projectId, type: 'ingestor', iat: Math.floor(Date.now() / 1000) },
    process.env.INGESTOR_JWT_SECRET,
    { expiresIn: '90d' }
  );
}

export const enableAnalytics = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.projectId,
      userId: req.user.userId,
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (!project.analytics?.trackingId) {
      project.analytics = {
        enabled: true,
        trackingId: generateProjectToken(project._id.toString()),
        enabledAt: new Date(),
      };
    } else {
      project.analytics.enabled = true;
      project.analytics.enabledAt = new Date();
    }

    await project.save();

    res.json({
      success: true,
      trackingId: project.analytics.trackingId,
    });
  } catch (error) {
    console.error("Enable Analytics Error:", error);
    res.status(500).json({ success: false, message: "Failed to enable analytics" });
  }
};

export const disableAnalytics = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.projectId,
      userId: req.user.userId,
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (project.analytics) {
      project.analytics.enabled = false;
      await project.save();
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Disable Analytics Error:", error);
    res.status(500).json({ success: false, message: "Failed to disable analytics" });
  }
};

import { nanoid } from 'nanoid';

export const enableStatusPage = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.projectId,
      userId: req.user.userId,
    });

    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    if (!project.slug) {
      project.slug = `${project.repoName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${nanoid(6)}`;
    }
    project.statusPageEnabled = true;
    await project.save();

    res.json({ success: true, slug: project.slug });
  } catch (error) {
    console.error("Enable Status Page Error:", error);
    res.status(500).json({ success: false, message: "Failed to enable status page" });
  }
};

export const disableStatusPage = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.projectId,
      userId: req.user.userId,
    });

    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    project.statusPageEnabled = false;
    await project.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to disable status page" });
  }
};

import AnalyticsEvent from "../models/AnalyticsEvent.js";

function getFromDate(range) {
  const now = new Date();
  const map = {
    "24h": 1,
    "3d": 3,
    "7d": 7,
    "30d": 30,
  };
  const days = map[range] || 7;
  now.setDate(now.getDate() - days);
  return now;
}

export const getAnalyticsSummary = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { range = "7d", environment = "all" } = req.query;

    const project = await Project.findOne({
      _id: projectId,
      userId: req.user.userId,
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const fromDate = getFromDate(range);

    const match = {
      projectId: project._id,
      timestamp: { $gte: fromDate },
    };

    if (environment !== "all") {
      match.environment = environment;
    }

    const baseMatch = { ...match, eventType: "page_view" };

    const [
      pageViews,
      visitorsResult,
      bounceResult,
      timeseries,
      topPages,
      topReferrers,
      topHostnames,
      topCountries,
      topDevices,
      topBrowsers,
      topOS
    ] = await Promise.all([
      AnalyticsEvent.countDocuments(baseMatch),
      
      AnalyticsEvent.distinct("visitorHash", baseMatch),
      
      AnalyticsEvent.aggregate([
        { $match: baseMatch },
        { $group: { _id: "$visitorHash", count: { $sum: 1 } } },
        { $group: { _id: null, totalVisitors: { $sum: 1 }, bouncedVisitors: { $sum: { $cond: [{ $eq: ["$count", 1] }, 1, 0] } } } }
      ]),

      AnalyticsEvent.aggregate([
        { $match: baseMatch },
        { 
          $group: { 
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            visitors: { $addToSet: "$visitorHash" },
            pageViews: { $sum: 1 }
          } 
        },
        { $project: { date: "$_id", visitors: { $size: "$visitors" }, pageViews: 1, _id: 0 } },
        { $sort: { date: 1 } }
      ]),

      AnalyticsEvent.aggregate([
        { $match: baseMatch },
        { $group: { _id: "$path", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      AnalyticsEvent.aggregate([
        { $match: { ...baseMatch, referrer: { $ne: null, $ne: "" } } },
        { $group: { _id: "$referrer", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      AnalyticsEvent.aggregate([
        { $match: { ...baseMatch, hostname: { $ne: null, $ne: "" } } },
        { $group: { _id: "$hostname", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      AnalyticsEvent.aggregate([
        { $match: { ...baseMatch, country: { $ne: null, $ne: "" } } },
        { $group: { _id: "$country", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      AnalyticsEvent.aggregate([
        { $match: { ...baseMatch, device: { $ne: null, $ne: "" } } },
        { $group: { _id: "$device", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      AnalyticsEvent.aggregate([
        { $match: { ...baseMatch, browser: { $ne: null, $ne: "" } } },
        { $group: { _id: "$browser", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      AnalyticsEvent.aggregate([
        { $match: { ...baseMatch, os: { $ne: null, $ne: "" } } },
        { $group: { _id: "$os", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])
    ]);

    const visitors = visitorsResult.length;
    let bounceRate = 0;
    if (bounceResult.length > 0 && bounceResult[0].totalVisitors > 0) {
      bounceRate = Math.round((bounceResult[0].bouncedVisitors / bounceResult[0].totalVisitors) * 100);
    }

    res.json({
      success: true,
      data: {
        pageViews,
        visitors,
        bounceRate,
        timeseries,
        topPages,
        topReferrers,
        topHostnames,
        topCountries,
        topDevices,
        topBrowsers,
        topOS
      },
    });
  } catch (error) {
    console.error("Get Analytics Summary Error:", error);
    res.status(500).json({ success: false, message: "Failed to get analytics summary" });
  }
};

export const getProjectUsage = async (req, res) => {
  try {
    const { id } = req.params;
    const { range = "current" } = req.query; 

    // Calculate startTime and endTime based on range
    let startTime;
    const now = new Date();
    
    if (range === "7d") {
      now.setDate(now.getDate() - 7);
      startTime = now.toISOString();
    } else if (range === "30d") {
      now.setDate(now.getDate() - 30);
      startTime = now.toISOString();
    } else {
      // current billing cycle (approx start of month)
      now.setDate(1);
      startTime = now.toISOString();
    }
    const endTime = new Date().toISOString();

    const project = await Project.findOne({
      _id: id,
      userId: req.user.userId,
    });

    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    const platform = project.configuration?.backendPlatform;

    if (platform === 'render') {
      const { getRenderToken, getRenderUsage, getRenderCPU, getRenderRequests } = await import('../services/providers/render.service.js');
      const token = await getRenderToken(req.user.userId);
      if (!token) return res.status(400).json({ success: false, message: "Render not connected" });
      
      const serviceId = project.configuration.renderServiceId;
      if (!serviceId) return res.status(400).json({ success: false, message: "No Render service linked" });
      
      try {
        const [bandwidthRes, cpuRes, requestsRes] = await Promise.all([
          getRenderUsage(token, serviceId, startTime, endTime).catch((err) => ({ error: err.message, usage: [] })),
          getRenderCPU(token, serviceId, startTime, endTime).catch((err) => ({ error: err.message, usage: [] })),
          getRenderRequests(token, serviceId, startTime, endTime).catch((err) => ({ error: err.message, usage: [] }))
        ]);

        return res.json({ 
          success: true, 
          platform: 'render', 
          usage: {
            bandwidth: bandwidthRes,
            cpu: cpuRes,
            requests: requestsRes
          }
        });
      } catch (err) {
        return res.status(500).json({ success: false, message: "Error fetching Render metrics", error: err.message });
      }

    } else if (platform === 'railway') {
      const { getRailwayToken, getRailwayUsage } = await import('../services/providers/railway.service.js');
      const token = await getRailwayToken(req.user.userId);
      if (!token) return res.status(400).json({ success: false, message: "Railway not connected" });
      
      const railwayProjectId = project.configuration.railwayProjectId;
      if (!railwayProjectId) return res.status(400).json({ success: false, message: "No Railway project linked" });
      
      const usage = await getRailwayUsage(token, railwayProjectId, startTime, endTime);
      return res.json({ success: true, platform: 'railway', usage });

    } else {
      return res.status(400).json({ success: false, message: "Project does not have a supported backend platform for usage tracking." });
    }

  } catch (error) {
    console.error("Get Project Usage Error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch usage metrics", error: error.message });
  }
};

export const getAiUsage = async (req, res) => {
  try {
    const { projectId, range = '14d', feature = 'total' } = req.query;
    
    let query = { userId: req.user.userId };
    if (projectId) {
      query.projectId = projectId;
    }
    if (feature && feature !== 'total') {
      query.feature = feature;
    }

    // Determine time boundary and grouping
    let days = 14;
    let isHourly = false;
    if (range === '24h') {
      days = 1;
      isHourly = true;
    } else if (range === '3d') days = 3;
    else if (range === '7d') days = 7;
    else if (range === '15d') days = 15;
    else if (range === '30d') days = 30;
    else if (range === '60d') days = 60;
    else if (range === 'max') days = 90;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // For 24h, we want exactly 24 hours back
    if (isHourly) {
      startDate.setTime(Date.now() - 24 * 60 * 60 * 1000);
    }
    
    query.createdAt = { $gte: startDate };

    const usages = await AiUsage.find(query).sort({ createdAt: -1 }).populate('projectId', 'repoName repoFullName');
    
    // Calculate chart data map
    const chartDataMap = {};
    
    if (isHourly) {
      // Initialize last 24 hours
      for (let i = 23; i >= 0; i--) {
        const d = new Date();
        d.setHours(d.getHours() - i, 0, 0, 0); // start of that hour
        const dateStr = d.toISOString(); // e.g. "2023-10-01T14:00:00.000Z"
        chartDataMap[dateStr] = { date: dateStr, value: 0 };
      }
    } else {
      // Initialize days
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        chartDataMap[dateStr] = { date: dateStr, value: 0 };
      }
    }

    let totalUsage = 0;

    usages.forEach(u => {
      totalUsage += 1;
      
      let key = "";
      if (isHourly) {
        const d = new Date(u.createdAt);
        d.setMinutes(0, 0, 0);
        key = d.toISOString();
      } else {
        key = u.createdAt.toISOString().split('T')[0];
      }

      if (chartDataMap[key] !== undefined) {
        chartDataMap[key].value += 1;
      }
    });

    const chartData = Object.values(chartDataMap);
    
    // We only need recentActivity for the 'total' feature to avoid duplicate logs in the UI
    const recentActivity = feature === 'total' ? usages.slice(0, 10) : [];

    return res.json({ success: true, total: totalUsage, chartData, recentActivity });
  } catch (error) {
    console.error("Get AI Usage Error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch AI usage metrics", error: error.message });
  }
};
